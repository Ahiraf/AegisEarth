"""Run the HF image locally on its real port/UID, using only the disposable foundation DB."""

import argparse
import hashlib
import json
import subprocess
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def docker(*args):
    return subprocess.run(
        ["docker", *args], check=True, capture_output=True, text=True, timeout=45
    ).stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="cosmic-motion-hf-local")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/verification/image_smoke.json")
    args = parser.parse_args()
    container = docker(
        "run",
        "--rm",
        "-d",
        "--name",
        "cosmic-hf-smoke-" + uuid.uuid4().hex[:8],
        "--network",
        "cosmic-foundation_default",
        "-p",
        "127.0.0.1:17860:7860",
        "-e",
        "DATABASE_URL=postgresql+psycopg://cosmic:local-foundation-only@db:5432/cosmic_foundation",
        "-e",
        'CORS_ORIGINS=["http://127.0.0.1:5173"]',
        args.image,
    )
    try:
        deadline = time.monotonic() + 30
        while True:
            try:
                response = httpx.get("http://127.0.0.1:17860/api/v1/health/ready", timeout=5)
                if response.status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            if time.monotonic() > deadline:
                raise RuntimeError("HF-image local readiness timed out")
            time.sleep(1)
        targets = httpx.get("http://127.0.0.1:17860/api/v1/targets").json()
        cors = httpx.options(
            "http://127.0.0.1:17860/api/v1/views",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,idempotency-key",
            },
        )
        assert cors.status_code == 200
        assert cors.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
        limits = httpx.get("http://127.0.0.1:17860/api/v1/system/capabilities").json()[
            "view_limits"
        ]
        docker("exec", container, "python", "-m", "pip", "check")
        uid = int(docker("exec", container, "id", "-u"))
        assert uid == 1000 and targets["total"] == 5
        report = {
            "verified_at_utc": datetime.now(UTC).isoformat(),
            "scope": "local_HF_image_not_cloud_deployment",
            "port": 7860,
            "runtime_uid": uid,
            "database_readiness": response.status_code,
            "curated_targets": targets["total"],
            "python": docker("exec", container, "python", "--version"),
            "image_id": docker("image", "inspect", args.image, "--format", "{{.Id}}"),
            "cors_preflight": cors.status_code,
            "pip_check": "passed",
            "view_limits": limits,
            "dependency_lock_sha256": {
                name: hashlib.sha256((ROOT / "backend" / name).read_bytes()).hexdigest()
                for name in (
                    "requirements.lock",
                    "requirements-build.lock",
                    "requirements-test.lock",
                    "requirements-dev.lock",
                )
            },
        }
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    finally:
        docker("stop", container)


if __name__ == "__main__":
    main()
