"""Real local API -> PostgreSQL -> isolated worker -> IRSA FITS -> artifact integrity proof."""

import hashlib
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def wait_ready(client, view_id):
    started = time.monotonic()
    last = None
    while time.monotonic() - started < 300:
        response = client.get("/api/v1/views/" + view_id)
        response.raise_for_status()
        view = response.json()
        if view["status"] != last:
            print(view_id, view["status"], view["error_code"], flush=True)
            last = view["status"]
        if view["status"] in {"succeeded", "failed", "canceled"}:
            assert view["status"] == "succeeded", view["error_code"]
            return view
        time.sleep(1)
    raise AssertionError("Local acquisition did not finish within 300 seconds")


def main():
    report = {"verified_at_utc": datetime.now(UTC).isoformat(), "checks": {}}
    body = {
        "contract_version": "view-v1",
        "region": {"ra": 269.45, "dec": 4.76, "width_arcmin": 3, "height_arcmin": 3},
        "collections": ["spherex_qr3"],
        "max_frames": 1,
    }
    with httpx.Client(base_url="http://127.0.0.1:18000", timeout=120) as client:
        client.get("/api/v1/views/session").raise_for_status()
        key = str(uuid4())
        headers = {"Idempotency-Key": key}
        response = client.post("/api/v1/views", json=body, headers=headers)
        response.raise_for_status()
        accepted = response.json()
        assert (
            client.post("/api/v1/views", json=body, headers=headers).json()["id"] == accepted["id"]
        )
        report["checks"]["durable_idempotent_acceptance"] = True
        view = wait_ready(client, accepted["id"])
        assert view["result"]["stage"] == "inputs_ready" and not view["viewer_execution_available"]
        report["checks"]["actual_isolated_worker_completed"] = True
        files = []
        for file in view["artifacts"]:
            assert "storage_key" not in file
            metadata = client.get("/api/v1/artifacts/" + file["id"]).json()
            data = client.get(metadata["download_url"])
            data.raise_for_status()
            assert hashlib.sha256(data.content).hexdigest() == file["sha256"]
            assert len(data.content) == file["size_bytes"]
            assert file["validation"]["structurally_validated"]
            files.append(
                {
                    k: file[k]
                    for k in (
                        "id",
                        "product_id",
                        "sha256",
                        "size_bytes",
                        "source_url",
                        "validation",
                    )
                }
            )
        assert len(files) == 1
        report["checks"]["raw_fits_hash_and_structural_integrity"] = True
        reused = client.post(
            "/api/v1/views", json=body, headers={"Idempotency-Key": str(uuid4())}
        ).json()
        assert reused["cache_hit"] and reused["id"] == view["id"]
        report["checks"]["completed_input_cache_reuse"] = True
        report.update(
            {
                "view_id": view["id"],
                "request": body,
                "result": view["result"],
                "artifacts": files,
                "scope": "local_input_acquisition_not_registered_movie_or_cloud_deployment",
            }
        )
    path = ROOT / "docs/verification/views_report.json"
    path.write_text(json.dumps(report, indent=2) + "\n")
    print("Saved", path.relative_to(ROOT), flush=True)


if __name__ == "__main__":
    main()
