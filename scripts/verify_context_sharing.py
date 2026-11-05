"""Read-only survey context + bounded refresh/GIF jobs on retained real SPHEREx views."""

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
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from verify_foundation import local_token

from app.core.config import Settings
from app.core.gateway import GatewayRepository
from app.modules.views.schemas import PreparedViewRequest

OUT = ROOT / "docs/verification/context_sharing.json"
API = "http://127.0.0.1:18000"


def wait(client, receipt):
    deadline = time.monotonic() + 360
    while time.monotonic() < deadline:
        view = client.get(receipt["status_url"]).json()
        if view["status"] in {"succeeded", "failed", "canceled"}:
            assert view["status"] == "succeeded", view.get("error_code")
            return view
        time.sleep(1)
    raise TimeoutError("bounded live job wait exceeded")


def main():
    parent = json.loads((ROOT / "docs/verification/targets/wise-0855.json").read_text())["cases"][
        0
    ]["view_id"]
    evidence = {
        "verified_at_utc": datetime.now(UTC).isoformat(),
        "source_view_id": parent,
        "scope": "local foundation and real IRSA context; no public hosting or production React claim",
        "checks": {},
    }
    with httpx.Client(base_url=API, timeout=120) as client:
        failures = []
        evidence["provider_retry_receipts"] = failures

        def context_get(path, **kwargs):
            for attempt in range(3):
                response = client.get(path, **kwargs)
                if response.status_code < 500:
                    return response
                failures.append(
                    {
                        "path": path,
                        "attempt": attempt + 1,
                        "status": response.status_code,
                        "body": response.json(),
                    }
                )
                OUT.write_text(json.dumps(evidence, indent=2, allow_nan=False) + "\n")
                if attempt < 2:
                    time.sleep(1)
            return response

        client.get("/api/v1/views/session").raise_for_status()
        prefix = f"/api/v1/views/{parent}"
        baseline = client.get(prefix + "/manifest")
        baseline.raise_for_status()
        manifest = baseline.json()
        frames = client.get(prefix + "/frames?limit=12").json()["items"]
        link_response = client.get(prefix + "/links")
        link_response.raise_for_status()
        links = link_response.json()
        state = client.get(links["resolve_url"]).json()["state"]
        assert state == links["state"]
        evidence["links"] = links
        evidence["checks"]["coordinate_roundtrip_and_finite_frozen_link"] = True
        evidence["catalogs"] = {}
        for survey in ["gaia", "wise"]:
            response = context_get(
                prefix + "/overlays/catalogs", params={"survey": survey, "limit": 100}
            )
            response.raise_for_status()
            data = response.json()
            assert data["markers"] and all(not m["spherex_detection"] for m in data["markers"])
            assert any(m["pixel"]["inside"] for m in data["markers"])
            assert all(isinstance(m["id"], str) for m in data["markers"])
            evidence["catalogs"][survey] = data
            print("catalog", survey, len(data["markers"]), flush=True)
        evidence["checks"]["real_gaia_and_wise_catalogs"] = True
        evidence["wise_images"] = []
        for band in [1, 2]:
            response = context_get(prefix + f"/overlays/wise/{band}")
            response.raise_for_status()
            meta = response.json()
            data = client.get(meta["fits_url"])
            data.raise_for_status()
            png = client.get(meta["png_url"], headers={"Origin": "http://127.0.0.1:15173"})
            png.raise_for_status()
            assert png.headers["access-control-allow-origin"] == "http://127.0.0.1:15173"
            with fits.open(io.BytesIO(data.content)) as h:
                assert list(h[0].data.shape) == frames[0]["spatial"]["shape"]
                w = WCS(h[0].header)
                r = WCS(fits.Header.fromstring(frames[0]["spatial"]["wcs_header"], sep="\n"))
                assert np.allclose(w.pixel_to_world_values(1, 1), r.pixel_to_world_values(1, 1))
            assert Image.open(io.BytesIO(png.content)).mode == "RGBA"
            meta["delivered_png_sha256"] = hashlib.sha256(png.content).hexdigest()
            meta["delivered_fits_sha256"] = hashlib.sha256(data.content).hexdigest()
            evidence["wise_images"].append(meta)
            print("image", band, meta["valid_fraction"], flush=True)
            target = ROOT / f"var/context-sharing/wise-w{band}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(png.content)
        evidence["checks"]["real_w1_w2_common_wcs_and_cors"] = True
        metadata = client.get(prefix + "/export-metadata").json()
        rows = list(
            csv.DictReader(io.StringIO(client.get(prefix + "/export-metadata?format=csv").text))
        )
        assert metadata["manifest_sha256"] == manifest["manifest_sha256"] and rows
        evidence["checks"]["json_csv_export_preserves_sources_and_credits"] = True
        body = {
            "contract_version": "export-v1",
            "inputs": [{"view_id": parent, "index": i} for i in range(3)],
            "frame_duration_ms": 800,
            "loop": False,
        }
        key = str(uuid4())
        response = client.post(prefix + "/exports", json=body, headers={"Idempotency-Key": key})
        response.raise_for_status()
        receipt = response.json()
        wait(client, receipt)
        result = client.get(receipt["result_url"])
        result.raise_for_status()
        report = result.json()
        for artifact in report["artifacts"]:
            response = client.get("/api/v1/artifacts/" + artifact["id"] + "/content")
            response.raise_for_status()
            assert hashlib.sha256(response.content).hexdigest() == artifact["sha256"]
            if artifact["kind"] == "movie_gif":
                with Image.open(io.BytesIO(response.content)) as gif:
                    assert (
                        gif.n_frames == 3 and gif.info["duration"] == 800 and "loop" not in gif.info
                    )
                    gif.convert("RGB").save(ROOT / "var/context-sharing/export-frame.png")
            if artifact["kind"] == "export_provenance":
                assert len(response.json()["frames"]) == 3 and "IRSA" in response.json()["credits"]
        replay = client.post(prefix + "/exports", json=body, headers={"Idempotency-Key": key})
        replay.raise_for_status()
        assert replay.json()["id"] == receipt["id"]
        evidence["export"] = {"job_id": receipt["id"], "request": body, "report": report}
        evidence["checks"]["durable_gif_worker_hashes_idempotency_and_provenance"] = True
        response = client.post(prefix + "/refresh", headers={"Idempotency-Key": str(uuid4())})
        response.raise_for_status()
        refreshed = response.json()
        wait(client, refreshed)
        fresh = client.get(refreshed["status_url"]).json()
        assert refreshed["id"] != parent and fresh["snapshot_id"] != manifest["source_snapshot_id"]
        assert client.get(prefix + "/manifest").json() == manifest
        evidence["refreshed_view"] = {
            "id": refreshed["id"],
            "snapshot_id": fresh["snapshot_id"],
            "status": fresh["status"],
        }
        checks = client.get("/api/v1/releases/refresh-status")
        checks.raise_for_status()
        evidence["refresh_status"] = checks.json()
        query = (
            PreparedViewRequest.model_validate(state["request"]).discovery().model_dump(mode="json")
        )
        assert client.post("/api/v1/releases/refresh", json=query).status_code == 403
        evidence["checks"]["explicit_refresh_new_snapshot_old_manifest_unchanged"] = True
        evidence["checks"]["admin_refresh_requires_server_secret"] = True
    settings = Settings(
        _env_file=None,
        database_transport="postgrest",
        gateway_url="https://localhost:18443",
        gateway_token=local_token(),
        gateway_ca_file=str(ROOT / "var/foundation/root.crt"),
    )
    gateway = GatewayRepository(settings)
    try:
        assert gateway.rpc("readiness")["schema_revision"] == "cosmic_0008"
        assert isinstance(gateway.rpc("release_refresh_status"), list)
        evidence["checks"]["restricted_authenticated_https_refresh_status"] = True
    finally:
        gateway.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(evidence, indent=2, allow_nan=False) + "\n")
    print(json.dumps(evidence["checks"], indent=2))


if __name__ == "__main__":
    main()
