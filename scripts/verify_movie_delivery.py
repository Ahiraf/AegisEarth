"""Local real-data movie delivery, cache, pagination, FITS/WCS and HTTPS RPC proof.

Requires compose.foundation.yaml. Creates/reuses a bounded local view-v2.
No tokens/cookies/capabilities are written to the tracked evidence.
"""

import hashlib
import json
import sys
import time
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import httpx
from astropy.io import fits
from verify_foundation import local_token

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import Settings
from app.core.gateway import GatewayRepository
from app.modules.views.movie import build_movie, fingerprint


def prepare_live():
    path = ROOT / "var/foundation/step5-live.json"
    live = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    with httpx.Client(base_url="http://127.0.0.1:18000", timeout=120) as client:
        existing = client.get(live["accepted"]["status_url"]) if live else None
        if (
            not existing
            or existing.status_code != 200
            or existing.json().get("delivery_state") in ("expired", "unavailable")
        ):
            body = {
                "contract_version": "view-v2",
                "region": {"ra": 269.45, "dec": 4.76, "width_arcmin": 3, "height_arcmin": 3},
                "collections": ["spherex_qr3"],
                "max_frames": 3,
                "preparation": {"spectral_mode": "common_available"},
            }
            response = client.post(
                "/api/v1/views", json=body, headers={"Idempotency-Key": str(uuid4())}
            )
            response.raise_for_status()
            result = response.json()
            live = {"accepted": {k: result[k] for k in ("id", "status_url")}, "request": body}
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(live, indent=2) + "\n", encoding="utf-8")
        deadline = time.monotonic() + 360
        while time.monotonic() < deadline:
            state = client.get(live["accepted"]["status_url"])
            state.raise_for_status()
            if state.json()["status"] == "succeeded":
                return live
            assert state.json()["status"] not in ("failed", "canceled"), state.json().get(
                "error_code"
            )
            time.sleep(1)
    raise RuntimeError("Local preparation did not complete within the verification deadline")


def main():
    live = prepare_live()
    identifier = live["accepted"]["id"]
    evidence = {
        "verified_at_utc": datetime.now(UTC).isoformat(),
        "view_id": identifier,
        "request": live["request"],
        "checks": {},
        "frames": [],
    }
    gateway = GatewayRepository(
        Settings(
            _env_file=None,
            gateway_url="https://localhost:18443",
            gateway_token=local_token(),
            gateway_ca_file=str(ROOT / "var/foundation/root.crt"),
        )
    )
    try:
        with httpx.Client(base_url="http://127.0.0.1:18000", timeout=120) as client:
            path = f"/api/v1/views/{identifier}"
            response = client.get(path + "/manifest")
            response.raise_for_status()
            manifest = response.json()
            assert manifest["outcome"] == "ready_for_animation"
            assert not manifest["timelines"]["common"]["comparison_supported"]
            assert (
                client.get(
                    path + "/manifest", headers={"If-None-Match": response.headers["etag"]}
                ).status_code
                == 304
            )
            record = gateway.rpc("movie_lookup", {"p_id": identifier})
            assert record["sha256"] == manifest["manifest_sha256"] == fingerprint(record["payload"])
            assert client.get(path).json()["viewer_execution_available"] is True
            evidence["checks"].update(
                frozen_manifest_etag=True, https_lookup_parity=True, quality_limited_browsing=True
            )
            frames = []
            page = path + "/frames?limit=1"
            while page:
                response = client.get(page)
                response.raise_for_status()
                data = response.json()
                assert data["manifest_sha256"] == manifest["manifest_sha256"]
                frames.extend(data["items"])
                page = data["next_page"]
            assert len(frames) == 3 and [f["ordinal"] for f in frames] == [0, 1, 2]
            assert len({f["id"] for f in frames}) == 3
            assert sorted(float(f["time"]["mid_mjd_utc"]) for f in frames) == [
                float(f["time"]["mid_mjd_utc"]) for f in frames
            ]
            evidence["checks"]["stable_paginated_chronology"] = True
            for frame in frames:
                response = client.get(frame["preview"]["url"])
                response.raise_for_status()
                assert hashlib.sha256(response.content).hexdigest() == frame["preview"]["sha256"]
                assert (
                    client.get(
                        frame["preview"]["url"], headers={"If-None-Match": response.headers["etag"]}
                    ).status_code
                    == 304
                )
                response = client.get(
                    frame["science_image_url"], headers={"Origin": "http://127.0.0.1:15173"}
                )
                response.raise_for_status()
                assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:15173"
                assert "etag" in response.headers["access-control-expose-headers"].lower()
                with fits.open(BytesIO(response.content)) as hdus:
                    assert len(hdus) == 1 and list(hdus[0].data.shape) == frame["spatial"]["shape"]
                    assert hdus[0].header["BUNIT"] == "MJy/sr"
                assert (
                    client.get(
                        frame["science_image_url"],
                        headers={"If-None-Match": response.headers["etag"]},
                    ).status_code
                    == 304
                )
                evidence["frames"].append(
                    {
                        "frame_id": frame["id"],
                        "ordinal": frame["ordinal"],
                        "time": frame["time"],
                        "preview_sha256": frame["preview"]["sha256"],
                        "science_primary_sha256": hashlib.sha256(response.content).hexdigest(),
                        "inputs": frame["original_inputs"],
                        "quality": frame["quality"],
                        "spectral": frame["spectral"],
                    }
                )
            sky = client.get(path + "/frames/0/coordinates?x=3&y=5").json()
            pixel = client.get(
                path + f"/frames/0/coordinates?ra={sky['ra_deg']}&dec={sky['dec_deg']}"
            ).json()
            assert max(abs(pixel["x"] - 3), abs(pixel["y"] - 5)) < 1e-6
            evidence["checks"].update(
                preview_hashes_and_304=True,
                primary_fits_units_wcs_cors_304=True,
                png_sky_roundtrip=True,
            )
            # First-publication proof through restricted HTTPS role, using real one/zero-input worker jobs.
            for outcome, changes in (
                ("single_epoch", {"max_frames": 1}),
                ("no_data", {"start_at": "2024-01-01T00:00:00Z", "end_at": "2024-01-02T00:00:00Z"}),
            ):
                body = live["request"] | changes
                response = client.post(
                    "/api/v1/views", json=body, headers={"Idempotency-Key": str(uuid4())}
                )
                response.raise_for_status()
                accepted = response.json()
                deadline = time.monotonic() + 240
                while time.monotonic() < deadline:
                    view = gateway.rpc("view_get", {"p_id": accepted["id"]})
                    if view["status"] in ("succeeded", "failed", "canceled"):
                        break
                    time.sleep(1)
                assert view["status"] == "succeeded", view.get("error_code")
                report = gateway.rpc("frame_set_get", {"p_id": view["id"]})
                payload = build_movie(view, report)
                assert payload["outcome"] == outcome
                published = gateway.rpc(
                    "movie_publish",
                    {
                        "p_id": view["id"],
                        "p_report": report,
                        "p_payload": payload,
                        "p_sha256": fingerprint(payload),
                    },
                )
                assert published["payload"] == payload
                public = client.get(f"/api/v1/views/{view['id']}/manifest").json()
                assert public["outcome"] == outcome and not public["playback"]["loop_allowed"]
                evidence[outcome + "_view_id"] = view["id"]
                evidence["checks"][f"real_{outcome}_worker_and_https_publication"] = True
            evidence["manifest_sha256"] = manifest["manifest_sha256"]
            evidence["limitations"] = [
                "Local foundation only; no HF deployment or external storage acceptance",
                "Three observed epochs are a bounded archive sample, not a complete survey",
                "No scientific motion/variability or quantitative comparison claim; no ML loaded",
            ]
        (ROOT / "docs/verification/movie_delivery_report.json").write_text(
            json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(evidence["checks"], indent=2), flush=True)
    finally:
        gateway.close()


if __name__ == "__main__":
    main()
