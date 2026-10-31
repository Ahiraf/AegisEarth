"""Live view-v2 job, padded input, prepared files and authenticated gateway result parity."""

import hashlib
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx
from verify_foundation import local_token

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import Settings
from app.core.gateway import GatewayRepository


def main():
    body = {
        "contract_version": "view-v2",
        "region": {"ra": 269.45, "dec": 4.76, "width_arcmin": 3, "height_arcmin": 3},
        "collections": ["spherex_qr3"],
        "max_frames": 1,
        "preparation": {"spectral_mode": "common_available"},
    }
    evidence = {"verified_at_utc": datetime.now(UTC).isoformat(), "request": body, "checks": {}}
    with httpx.Client(base_url="http://127.0.0.1:18000", timeout=120) as client:
        client.get("/api/v1/views/session").raise_for_status()
        response = client.post(
            "/api/v1/views", json=body, headers={"Idempotency-Key": str(uuid4())}
        )
        response.raise_for_status()
        accepted = response.json()
        deadline = time.monotonic() + 360
        state = None
        while time.monotonic() < deadline:
            view = client.get(accepted["status_url"]).json()
            if view["status"] != state:
                print(view["id"], view["status"], view["error_code"], flush=True)
                state = view["status"]
            if state in {"succeeded", "failed", "canceled"}:
                break
            time.sleep(1)
        assert view["status"] == "succeeded", view.get("error_code")
        assert view["result"]["stage"] == "frames_prepared"
        result = client.get(view["result"]["preparation_url"])
        result.raise_for_status()
        report = result.json()
        evidence["checks"]["live_view_v2_preparation"] = True
        assert len(report["frames"]) == 1 and report["grid"]["mode"] == "sky_fixed"
        assert not report["sequence_eligible"] and report["outcome"] == "single_epoch"
        evidence["checks"]["single_input_not_claimed_as_animation"] = True
        downloaded = []
        for file in report["artifacts"]:
            data = client.get(f"/api/v1/artifacts/{file['id']}/content")
            data.raise_for_status()
            assert hashlib.sha256(data.content).hexdigest() == file["sha256"]
            assert data.headers["content-type"].split(";")[0] == file["content_type"]
            downloaded.append(
                {k: file[k] for k in ("id", "sha256", "size_bytes", "content_type", "kind")}
            )
            if file["kind"] == "common_preview":
                (ROOT / "var/frame-preparation-live.png").write_bytes(data.content)
        evidence["checks"]["prepared_png_fits_json_hashes"] = True
        bands = client.get(f"/api/v1/views/{view['id']}/bands").json()
        assert (
            bands["nominal_total"] == 102
            and bands["frames"][0]["spectral"]["quantitative_calibration"] is False
        )
        evidence["checks"]["local_proxy_distinct_from_nominal_catalog"] = True
        gateway = GatewayRepository(
            Settings(
                _env_file=None,
                gateway_url="https://localhost:18443",
                gateway_token=local_token(),
                gateway_ca_file=str(ROOT / "var/foundation/root.crt"),
            )
        )
        try:
            assert gateway.rpc("frame_set_get", {"p_id": view["id"]}) == report
            evidence["checks"]["https_preparation_parity"] = True
        finally:
            gateway.close()
        evidence.update(
            {
                "view_id": view["id"],
                "result": view["result"],
                "preparation": report,
                "verified_artifacts": downloaded,
            }
        )
    (ROOT / "docs/verification/prepared_view_report.json").write_text(
        json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
    )
    print("Prepared view and gateway verified", flush=True)


if __name__ == "__main__":
    main()
