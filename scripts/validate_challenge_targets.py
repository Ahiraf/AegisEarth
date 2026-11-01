"""Run bounded real five-target view-v2 acceptance and diagnostic evidence.

All source bytes remain outside Git. Re-run after scientific/source/config changes.
This is an engineering validation receipt, never scientific reviewer sign-off.
"""

import hashlib
import json
import platform
import sys
import time
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from uuid import uuid4

import httpx
from astropy.coordinates import SkyCoord

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.modules.preprocessing.pipeline import json_safe
from app.modules.targets.catalog import load_targets
from app.modules.targets.validation import VERSION, compare_targets, inspect_target

OUTPUT = ROOT / "docs/verification/targets"
CASES = {
    "barnards-star": ("spherex_qr3", "D2"),
    "epsilon-indi-b": ("spherex_qr2", "D6"),
    "wise-0855": ("spherex_qr2", "D6"),
    "rw-aurigae": ("spherex_qr3", "D2"),
    "r-draconis": ("spherex_qr3_deep", "D1"),
}
BAND_HINTS = {"D1": (0.8, 1.0), "D2": (1.3, 1.5), "D6": (4.4, 4.8)}


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(json_safe(value), indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )


def execute(client, target, run, *, supplied=False, overrides=None, case_name=None):
    collection, detector = CASES[target.slug]
    center = target.search_position("2026-01-01T00:00:00")
    if supplied:
        original = target.supplied_coordinate
        sky = SkyCoord(original["ra_sexagesimal"], original["dec_sexagesimal"], frame="icrs")
        center = {
            "ra_deg": float(sky.ra.deg),
            "dec_deg": float(sky.dec.deg),
            "model": "challenge_seed_unknown_epoch",
        }
    query = {
        "contract_version": "view-v2",
        "region": {
            "ra": center["ra_deg"],
            "dec": center["dec_deg"],
            "width_arcmin": 8 if supplied else 5,
            "height_arcmin": 8 if supplied else 5,
        },
        "collections": [collection],
        "detectors": [detector],
        "max_frames": 3,
        "preparation": {
            "spectral_mode": "detector",
            "detector": detector,
            "stretch": "shared_asinh",
            "target_exclusion_radius_arcsec": 120 if supplied else 60,
        },
    }
    if overrides:
        query.update(overrides)
    result = {
        "case": case_name or ("supplied_coordinate" if supplied else "catalog_prediction"),
        "request": query,
        "request_sha256": fingerprint(query),
        "query_center": center,
        "started_at_utc": datetime.now(UTC).isoformat(),
        "status": "not_submitted",
    }
    accepted = client.post("/api/v1/views", json=query, headers={"Idempotency-Key": str(uuid4())})
    result["submission_http_status"] = accepted.status_code
    if accepted.status_code not in (200, 202):
        result["status"] = "submission_unavailable"
        result["submission_error"] = accepted.json().get("detail")
        return result
    acceptance = accepted.json()
    identifier = acceptance["id"]
    result["view_id"] = identifier
    path = f"/api/v1/views/{identifier}"
    deadline = time.monotonic() + 360
    while time.monotonic() < deadline:
        response = client.get(path)
        response.raise_for_status()
        view = response.json()
        if view["status"] in ("succeeded", "failed", "canceled"):
            break
        time.sleep(2)
    result.update(
        status=view["status"],
        error_code=view.get("error_code"),
        snapshot_id=view["snapshot_id"],
        canonical_request=view["canonical_request"],
        finished_at_utc=datetime.now(UTC).isoformat(),
    )
    snapshot = client.get(f"/api/v1/observations/snapshots/{view['snapshot_id']}?limit=1")
    snapshot.raise_for_status()
    result["discovery_evidence"] = {k: v for k, v in snapshot.json().items() if k != "items"}
    if view["status"] != "succeeded":
        return result
    manifest = client.get(path + "/manifest")
    manifest.raise_for_status()
    movie = manifest.json()
    preparation = client.get(path + "/preparation")
    preparation.raise_for_status()
    report = preparation.json()
    result.update(
        manifest_sha256=movie["manifest_sha256"],
        manifest_url=path + "/manifest",
        movie_outcome=movie["outcome"],
        timelines={
            k: {
                f: v[f]
                for f in ("outcome", "frame_count", "distinct_epoch_count", "comparison_supported")
            }
            for k, v in movie["timelines"].items()
        },
        preparation_sha256=fingerprint(report),
        preparation=report,
        frames=[],
    )
    local = ROOT / "var/target-validation" / run / target.slug / result["case"]
    local.mkdir(parents=True, exist_ok=True)
    by_product = {r["product_id"]: r for r in view["artifacts"]}
    for frame in report["frames"]:
        artifact = by_product[frame["product_id"]]
        raw = client.get(f"/api/v1/artifacts/{artifact['id']}/content")
        raw.raise_for_status()
        assert hashlib.sha256(raw.content).hexdigest() == artifact["sha256"]
        native = local / (artifact["id"] + ".fits")
        native.write_bytes(raw.content)
        diagnostic = inspect_target(native, target, view["canonical_request"]["region"])
        result["frames"].append(
            {
                "product_id": frame["product_id"],
                "raw_artifact_id": artifact["id"],
                "sha256": artifact["sha256"],
                "source_url": artifact["source_url"],
                "local_path": native.relative_to(ROOT).as_posix(),
                "diagnostic": diagnostic,
            }
        )
    for mode in ("common", "native"):
        page = client.get(path + f"/frames?mode={mode}&limit=1")
        page.raise_for_status()
        delivered = []
        data = page.json()
        while True:
            for frame in data["items"]:
                image = client.get(frame["preview"]["url"])
                image.raise_for_status()
                assert hashlib.sha256(image.content).hexdigest() == frame["preview"]["sha256"]
                preview = local / f"{mode}-{frame['ordinal']}.png"
                preview.write_bytes(image.content)
                delivered.append(
                    {
                        "id": frame["id"],
                        "ordinal": frame["ordinal"],
                        "time": frame["time"],
                        "stretch": frame["stretch"],
                        "preview_sha256": frame["preview"]["sha256"],
                        "preview_path": preview.relative_to(ROOT).as_posix(),
                    }
                )
            if not data["next_page"]:
                break
            data = client.get(data["next_page"]).json()
        assert [f["ordinal"] for f in delivered] == list(range(len(delivered)))
        assert [float(f["time"]["mid_mjd_utc"]) for f in delivered] == sorted(
            float(f["time"]["mid_mjd_utc"]) for f in delivered
        )
        assert all(f["stretch"]["mode"] == "shared_asinh" for f in delivered)
        result[mode + "_delivery"] = delivered
    result["comparisons"] = compare_targets(
        target,
        [f["diagnostic"] for f in result["frames"]],
        report["frames"],
        report["pair_eligibility"],
        query["preparation"]["target_exclusion_radius_arcsec"],
    )
    result["scientific_outcome"] = "inconclusive_motion_and_photometry_not_validated"
    result["scientific_detection_validated"] = False
    return result


def offline(target):
    """Additional frozen source evidence and alternate-release/date coverage, not a live fallback movie."""
    records = json.loads(
        (ROOT / "docs/research/target_feasibility/cutouts_manifest.json").read_text(
            encoding="utf-8"
        )
    )["cutouts"]
    samples = []
    for record in records:
        if record["target"] != target.slug:
            continue
        path = ROOT / record["local_path"]
        if not path.exists():
            raise FileNotFoundError("Pinned native fixture unavailable: " + str(path))
        assert hashlib.sha256(path.read_bytes()).hexdigest() == record["sha256"]
        samples.append(
            {
                "sha256": record["sha256"],
                "local_path": record["local_path"],
                "source_url": record["url"],
                "collection": record["collection"],
                "diagnostic": inspect_target(path, target, record["fixed_sky_center"]),
            }
        )
    return samples


def pinned_comparisons(target, samples):
    return compare_targets(
        target,
        [r["diagnostic"] for r in samples],
        [
            {"registration": {"validated": False, "reason": "pinned_native_not_registered"}}
            for _ in samples
        ],
        {},
        60,
    )


def main():
    run = str(uuid4())
    OUTPUT.mkdir(parents=True, exist_ok=True)
    summary = {
        "version": VERSION,
        "run_id": run,
        "product": "AegisEarth",
        "verified_at_utc": datetime.now(UTC).isoformat(),
        "operator": "automated_backend_engineering_validation",
        "scientific_reviewer": None,
        "frontend_handoff": {
            "status": "accepted_in_production_UI",
            "evidence": "User confirmation, 1 November 2026; not a new independent production-browser audit",
        },
        "versions": {
            "python": platform.python_version(),
            **{p: version(p) for p in ("astropy", "numpy", "scipy", "fastapi")},
        },
        "catalog_sha256": hashlib.sha256(
            (ROOT / "backend/app/modules/targets/catalog.json").read_bytes()
        ).hexdigest(),
        "implementation_sha256": {
            name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in (
                "backend/app/modules/targets/validation.py",
                "backend/app/modules/preprocessing/pipeline.py",
                "backend/app/modules/registration/residuals.py",
            )
        },
        "targets": [],
    }
    identities = json.loads(
        (ROOT / "docs/research/target_feasibility/astrometry_receipt.json").read_text(
            encoding="utf-8"
        )
    )
    with httpx.Client(base_url="http://127.0.0.1:18000", timeout=120) as client:
        client.get("/api/v1/health/ready").raise_for_status()
        for target in load_targets():
            result = {
                "version": VERSION,
                "target": target.slug,
                "identity": target.model_dump(),
                "source_receipt": target.source_receipt,
                "catalog_sha256": summary["catalog_sha256"],
                "run_id": run,
                "operator": summary["operator"],
                "scientific_reviewer": None,
                "implementation_sha256": summary["implementation_sha256"],
                "pinned_native_diagnostics": offline(target),
                "cases": [],
            }
            result["pinned_native_comparisons"] = pinned_comparisons(
                target, result["pinned_native_diagnostics"]
            )
            if target.slug == "epsilon-indi-b":
                primary = next(r for r in identities["rows"] if r["main_id"] == "* eps Ind")
                result["identity_context"] = {
                    "selected_system": target.canonical_id,
                    "primary_id": primary["main_id"],
                    "catalog_separation_from_primary_arcsec": float(
                        SkyCoord(target.ra_deg, target.dec_deg, unit="deg")
                        .separation(SkyCoord(primary["ra"], primary["dec"], unit="deg"))
                        .arcsec
                    ),
                    "components_individually_resolved": False,
                    "binary_resolution_not_required": True,
                }
            for supplied in [False, True] if target.slug == "wise-0855" else [False]:
                print("Validating", target.slug, "supplied" if supplied else "catalog", flush=True)
                case = execute(client, target, run, supplied=supplied)
                result["cases"].append(case)
                save(OUTPUT / (target.slug + ".json"), result)
                print(
                    target.slug,
                    case["status"],
                    case.get("movie_outcome"),
                    case.get("error_code"),
                    flush=True,
                )
            initial = result["cases"][0]
            if (
                initial["status"] != "succeeded"
                or initial.get("timelines", {}).get("common", {}).get("frame_count", 0) < 2
            ):
                lo, hi = BAND_HINTS[CASES[target.slug][1]]
                followup = execute(
                    client,
                    target,
                    run,
                    overrides={"wavelength_min_um": lo, "wavelength_max_um": hi},
                    case_name="archive_band_followup",
                )
                followup["followup_reason"] = (
                    "Whole-image BAND hint reduces unrelated detector rows before the 40-row SIA cap; local wavelengths remain FITS-derived proxies."
                )
                result["cases"].append(followup)
                save(OUTPUT / (target.slug + ".json"), result)
            summary["targets"].append(
                {
                    "target": target.slug,
                    "receipt": f"docs/verification/targets/{target.slug}.json",
                    "cases": [
                        {
                            k: c.get(k)
                            for k in (
                                "case",
                                "view_id",
                                "status",
                                "movie_outcome",
                                "error_code",
                                "manifest_sha256",
                            )
                        }
                        for c in result["cases"]
                    ],
                    "pinned_native_count": len(result["pinned_native_diagnostics"]),
                    "scientific_motion_validated": False,
                    "scientific_variability_validated": False,
                }
            )
            save(OUTPUT / "summary.json", summary)
    finalize(summary)


def finalize(summary):
    summary["targets"] = []
    for target in load_targets():
        receipt = OUTPUT / (target.slug + ".json")
        report = json.loads(receipt.read_text(encoding="utf-8"))
        if report["run_id"] != summary["run_id"]:
            raise ValueError("Cannot merge different validation generations")
        summary["targets"].append(
            {
                "target": target.slug,
                "receipt": receipt.relative_to(ROOT).as_posix(),
                "cases": [
                    {
                        k: c.get(k)
                        for k in (
                            "case",
                            "view_id",
                            "status",
                            "movie_outcome",
                            "error_code",
                            "manifest_sha256",
                        )
                    }
                    for c in report["cases"]
                ],
                "pinned_native_count": len(report["pinned_native_diagnostics"]),
                "scientific_motion_validated": False,
                "scientific_variability_validated": False,
            }
        )
    summary["completed_at_utc"] = datetime.now(UTC).isoformat()
    summary["all_five_executed"] = len(summary["targets"]) == 5
    summary["all_live_cases_succeeded"] = all(
        c["status"] == "succeeded" for t in summary["targets"] for c in t["cases"]
    )
    save(OUTPUT / "summary.json", summary)
    print(
        "Five-target receipt written; all live cases succeeded:",
        summary["all_live_cases_succeeded"],
        flush=True,
    )


if __name__ == "__main__":
    main()
