"""Real derived jobs, frozen lineage, exports, HTTPS admission and optional six-detector archive proof."""

import argparse
import csv
import hashlib
import io
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx
from astropy.io import fits
from verify_foundation import local_token

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import Settings
from app.core.gateway import GatewayRepository
from app.modules.analyses.derived_service import submit
from app.modules.coadds.schemas import CoaddRequest
from app.modules.observations.repository import GatewayDiscoveryRepository
from app.modules.views.repository import HTTPSViewRepository
from app.modules.views.security import PublicTokens

API = "http://127.0.0.1:18000"
OUT = ROOT / "docs/verification/derived_operations.json"


def wait(client, receipt):
    deadline = time.monotonic() + 360
    while time.monotonic() < deadline:
        response = client.get(receipt["status_url"])
        response.raise_for_status()
        view = response.json()
        if view["status"] in ("succeeded", "failed", "canceled"):
            break
        time.sleep(1)
    assert view["status"] == "succeeded", view.get("error_code")
    return view


def operation(client, parent, route, body, *, kind=None):
    key = str(uuid4())
    path = f"/api/v1/views/{parent}/{route}"
    response = client.post(path, json=body, headers={"Idempotency-Key": key})
    response.raise_for_status()
    receipt = response.json()
    replay = client.post(path, json=body, headers={"Idempotency-Key": key})
    replay.raise_for_status()
    assert replay.json()["id"] == receipt["id"]
    wait(client, receipt)
    response = client.get(receipt["result_url"])
    response.raise_for_status()
    report = response.json()
    for file in report["artifacts"]:
        data = client.get(f"/api/v1/artifacts/{file['id']}/content")
        data.raise_for_status()
        assert hashlib.sha256(data.content).hexdigest() == file["sha256"]
        if file["kind"] == "spectrum_csv":
            assert len(list(csv.DictReader(io.StringIO(data.text)))) == len(report["samples"])
        if file["kind"] == "coadd_planes":
            with fits.open(io.BytesIO(data.content)) as h:
                assert {
                    "SCIENCE",
                    "VARIANCE",
                    "VALID",
                    "COUNT",
                    "COVERAGE",
                    "WEIGHTS",
                    "EXPOSURE",
                    "CONTRIBUTORS",
                } <= {d.name for d in h}
    print(route, receipt["id"], report["outcome"], flush=True)
    return {"id": receipt["id"], "request": body, "report": report}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--six-detectors", action="store_true")
    parser.add_argument("--six-detectors-only", action="store_true")
    args = parser.parse_args()
    if args.six_detectors_only:
        evidence = json.loads(OUT.read_text(encoding="utf-8"))
        evidence["six_detector_live"] = six_detector_live()
        evidence["checks"]["all_six_live_detectors"] = all(
            r.get("coadd_outcome") == "ready" for r in evidence["six_detector_live"]
        )
        OUT.write_text(json.dumps(evidence, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        print(json.dumps(evidence["checks"], indent=2), flush=True)
        return
    source = json.loads(
        (ROOT / "docs/verification/targets/wise-0855.json").read_text(encoding="utf-8")
    )["cases"][0]
    parent = source["view_id"]
    inputs = [{"view_id": parent, "index": i} for i in range(3)]
    evidence = {
        "verified_at_utc": datetime.now(UTC).isoformat(),
        "parent_view_id": parent,
        "checks": {},
        "operations": [],
    }
    with httpx.Client(base_url=API, timeout=120) as client:
        client.get("/api/v1/health/ready").raise_for_status()
        before = client.get(f"/api/v1/views/{parent}/manifest").json()["manifest_sha256"]
        options = client.get(f"/api/v1/views/{parent}/coadds/options")
        options.raise_for_status()
        assert len(options.json()["detectors"]) == 6
        row = operation(
            client,
            parent,
            "coadds",
            {
                "inputs": inputs,
                "detector": "D6",
                "wavelength_min_um": 4.4,
                "wavelength_max_um": 5.0,
            },
        )
        assert row["report"]["outcome"] == "ready"
        assert all(
            g["stretch"] == row["report"]["groups"][0]["stretch"] for g in row["report"]["groups"]
        )
        evidence["operations"].append(row)
        evidence["checks"].update(
            six_detector_options=True,
            shared_stretch_and_exposure_exports=True,
            immutable_parent=True,
            idempotent_admission=True,
        )
        spectrum = {
            "inputs": inputs,
            "epoch_positions": [
                ref
                | {
                    k: source["frames"][ref["index"]]["diagnostic"]["prediction"][k]
                    for k in ("ra_deg", "dec_deg")
                }
                for ref in inputs
            ],
        }
        row = operation(client, parent, "spectra", spectrum)
        assert len(row["report"]["samples"]) == 3 and row["report"]["epochs_kept_separate"]
        assert all(
            s["status"] == "diagnostic_only"
            and s["flux_uJy"] is not None
            and not s["quantitative_eligible"]
            for s in row["report"]["samples"]
        )
        evidence["operations"].append(row)
        evidence["checks"]["real_native_spectrum_json_csv"] = True
        row = operation(client, parent, "differences", {"inputs": inputs[:2]})
        assert row["report"]["outcome"] == "ineligible" and not any(
            a["kind"] == "difference_planes" for a in row["report"]["artifacts"]
        )
        evidence["operations"].append(row)
        evidence["checks"]["science_gate_does_not_fabricate_difference"] = True
        check = client.post("/api/v1/comparisons/validate", json={"inputs": inputs[:2]})
        check.raise_for_status()
        assert not check.json()["eligibility"]["eligible"]
        evidence["checks"]["comparison_preflight_reasons"] = True
        assert client.get(f"/api/v1/views/{parent}/manifest").json()["manifest_sha256"] == before
        # An unavailable detector and changed temporal response remain explicit results.
        row = operation(client, parent, "coadds", {"inputs": inputs, "detector": "D1"})
        assert row["report"]["outcome"] == "no_data"
        evidence["operations"].append(row)
        row = operation(
            client, parent, "coadds", {"inputs": inputs, "detector": "D6", "mode": "temporal_mean"}
        )
        assert row["report"]["outcome"] == "ineligible"
        evidence["operations"].append(row)
        evidence["checks"]["unavailable_detector_and_temporal_response_rejected"] = True
    gateway = GatewayRepository(
        Settings(
            _env_file=None,
            gateway_url="https://localhost:18443",
            gateway_token=local_token(),
            gateway_ca_file=str(ROOT / "var/foundation/root.crt"),
        )
    )
    try:
        settings = Settings(
            _env_file=None,
            public_token_secret="local-foundation-public-token-secret-not-production-2026",
        )
        tokens = PublicTokens(settings)
        _, scope = tokens.session(None)
        query = CoaddRequest(inputs=[inputs[0]], detector="D6", epoch_window_seconds=123)
        from uuid import UUID

        receipt, status = submit(
            HTTPSViewRepository(gateway),
            GatewayDiscoveryRepository(gateway),
            UUID(parent),
            query,
            "coadd",
            settings,
            tokens,
            scope,
            tokens.digest("ip", "https-verifier"),
            str(uuid4()),
        )
        assert status in (200, 202)
        with httpx.Client(base_url=API, timeout=120) as client:
            wait(client, receipt)
            result = client.get(receipt["result_url"])
            result.raise_for_status()
            assert result.json()["outcome"] == "ready"
        evidence["checks"]["authenticated_https_admission_and_publication"] = True
    finally:
        gateway.close()
    OUT.write_text(json.dumps(evidence, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    if args.six_detectors:
        evidence["six_detector_live"] = six_detector_live()
        evidence["checks"]["all_six_live_detectors"] = all(
            r.get("coadd_outcome") == "ready" for r in evidence["six_detector_live"]
        )
    evidence["limitations"] = [
        "frames-v1 lacks science-grade CWAVE/CBAND, PSF matching and covariance acceptance; quantitative differences remain blocked",
        "Local point-source spectra are physically converted diagnostic samples; no formal detections, upper limits or calibrated variability claims",
        "No official callable spectrophotometry API was verified; GUI workflow is not invoked as an undocumented service",
        "Local foundation only; external scientific review and public cloud deployment remain separate gates",
    ]
    OUT.write_text(json.dumps(evidence, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(evidence["checks"], indent=2), flush=True)


def six_detector_live():
    hints = {
        "D1": (0.8, 1.0),
        "D2": (1.3, 1.5),
        "D3": (1.9, 2.1),
        "D4": (2.8, 3.2),
        "D5": (4.0, 4.1),
        "D6": (4.5, 4.8),
    }
    parents = []
    results = []
    saved_path = ROOT / "docs/verification/detector_inputs.json"
    saved = json.loads(saved_path.read_text(encoding="utf-8")) if saved_path.exists() else []
    known = {}
    for detector, target in [("D1", "r-draconis"), ("D2", "barnards-star"), ("D6", "wise-0855")]:
        packet = json.loads(
            (ROOT / f"docs/verification/targets/{target}.json").read_text(encoding="utf-8")
        )
        known[detector] = next(
            c["view_id"] for c in packet["cases"] if c.get("movie_outcome") == "ready_for_animation"
        )
    known["D5"] = json.loads(
        (ROOT / "docs/verification/movie_player_report.json").read_text(encoding="utf-8")
    )["view_id"]
    # Separate sessions keep each client under its hourly budget; the shared IP/queue budgets still apply.
    with httpx.Client(base_url=API, timeout=120) as client:
        for detector, (lo, hi) in hints.items():
            body = {
                "contract_version": "view-v2",
                "region": {"ra": 269.45, "dec": 4.76, "width_arcmin": 3, "height_arcmin": 3},
                "collections": ["spherex_qr3"],
                "detectors": [detector],
                "wavelength_min_um": lo,
                "wavelength_max_um": hi,
                "max_frames": 1,
                "preparation": {"spectral_mode": "detector", "detector": detector},
            }
            prior = next((r for r in saved if r["detector"] == detector), {})
            row = {"detector": detector, "attempts": prior.get("attempts", [])}
            results.append(row)
            candidate = prior.get("parent_view_id") or known.get(detector)
            if candidate:
                response = client.get(f"/api/v1/views/{candidate}/preparation")
                if response.status_code == 200 and response.json().get("frames"):
                    row["parent_view_id"] = candidate
                    row["input_method"] = "reused_verified_frozen_real_input"
                    parents.append({"view_id": candidate, "index": 0})
                    print("Reused real detector input", detector, candidate, flush=True)
                    saved_path.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
                    continue
            for collection in ("spherex_qr3", "spherex_qr2"):
                body["collections"] = [collection]
                response = client.post(
                    "/api/v1/views", json=body, headers={"Idempotency-Key": str(uuid4())}
                )
                attempt = {"request": dict(body), "http_status": response.status_code}
                row["attempts"].append(attempt)
                if response.status_code not in (200, 202):
                    continue
                receipt = response.json()
                attempt["id"] = receipt["id"]
                saved_path.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
                try:
                    wait(client, receipt)
                    report = client.get(f"/api/v1/views/{receipt['id']}/preparation").json()
                    if not report.get("frames"):
                        attempt["outcome"] = "no_data"
                        continue
                except AssertionError as exc:
                    attempt["outcome"] = str(exc)
                    continue
                attempt["outcome"] = "inputs_ready"
                parents.append({"view_id": receipt["id"], "index": 0})
                row["parent_view_id"] = receipt["id"]
                row["request"] = dict(body)
                print("Live detector input", detector, collection, receipt["id"], flush=True)
                break
            saved_path.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    with httpx.Client(base_url=API, timeout=120) as client:
        for row in results:
            if not row.get("parent_view_id"):
                row["coadd_outcome"] = "source_unavailable"
                continue
            child = operation(
                client,
                row["parent_view_id"],
                "coadds",
                {
                    "inputs": [{"view_id": row["parent_view_id"], "index": 0}],
                    "detector": row["detector"],
                },
            )
            row["coadd_id"] = child["id"]
            row["coadd_outcome"] = child["report"]["outcome"]
            row["report"] = child["report"]
    return results


if __name__ == "__main__":
    main()
