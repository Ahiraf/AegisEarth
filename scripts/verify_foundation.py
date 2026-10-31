"""Verify only the named local disposable foundation stack; never targets a user database."""

import argparse
import base64
import hashlib
import hmac
import json
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import Settings
from app.core.gateway import GatewayConflict, GatewayError, GatewayRepository

DATABASE = (
    "postgresql://cosmic:local-foundation-only@127.0.0.1:55432/cosmic_foundation?connect_timeout=5"
)


def local_token():
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(
            b"="
        )

    body = (
        encode({"alg": "HS256", "typ": "JWT"})
        + b"."
        + encode({"role": "cosmic_api", "exp": int(time.time()) + 600})
    )
    signature = hmac.new(
        b"local-foundation-jwt-secret-not-for-production-2026", body, hashlib.sha256
    ).digest()
    return (body + b"." + base64.urlsafe_b64encode(signature).rstrip(b"=")).decode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--restart",
        action="store_true",
        help="Also restart only the disposable DB and verify recovery",
    )
    args = parser.parse_args()
    ca = ROOT / "var/foundation/root.crt"
    settings = Settings(
        _env_file=None,
        database_transport="postgrest",
        gateway_url="https://localhost:18443",
        gateway_token=local_token(),
        gateway_ca_file=str(ca),
    )
    scope = "foundation-verification-" + str(uuid.uuid4())
    checks = {}
    gateway = GatewayRepository(settings)
    try:
        checks["native_api_ready"] = (
            httpx.get("http://localhost:18000/api/v1/health/ready").status_code == 200
        )
        checks["authenticated_verified_tls_rpc"] = gateway.rpc("readiness")["status"] == "ready"
        import ssl

        with httpx.Client(verify=ssl.create_default_context(cafile=str(ca))) as client:
            checks["anonymous_denied"] = client.post(
                "https://localhost:18443/rpc/readiness", json={}
            ).status_code in (401, 403)
        params = {
            "p_scope": scope,
            "p_key": "first",
            "p_request_hash": "a" * 64,
            "p_kind": "view",
            "p_config": {"probe_only": True},
        }
        job = gateway.rpc("enqueue_job", params)[0]
        checks["idempotent_acceptance"] = gateway.rpc("enqueue_job", params)[0]["id"] == job["id"]
        try:
            gateway.rpc("enqueue_job", {**params, "p_request_hash": "b" * 64})
        except GatewayConflict:
            checks["conflicting_key_rollback"] = True
        else:
            checks["conflicting_key_rollback"] = False
        with ThreadPoolExecutor(max_workers=2) as pool:
            claims = list(
                pool.map(
                    lambda worker: gateway.rpc("claim_job", {"p_worker": worker}),
                    ["one", "two"],
                )
            )
        claimed = [row for claim in claims for row in claim if row["id"] == job["id"]]
        checks["single_atomic_claim"] = len(claimed) == 1
        claim = claimed[0]
        gateway.rpc("heartbeat_job", {"p_id": job["id"], "p_token": claim["lease_token"]})
        gateway.rpc("cancel_job", {"p_id": job["id"], "p_scope": scope})
        try:
            gateway.rpc(
                "finish_job",
                {
                    "p_id": job["id"],
                    "p_token": claim["lease_token"],
                    "p_status": "succeeded",
                },
            )
        except GatewayConflict:
            checks["canceled_worker_fenced"] = True
        else:
            checks["canceled_worker_fenced"] = False
        second = gateway.rpc("enqueue_job", {**params, "p_key": "second"})[0]
        first_lease = gateway.rpc("claim_job", {"p_worker": "crashed-worker"})[0]
        with psycopg.connect(DATABASE) as connection:
            connection.execute(
                "UPDATE processing_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=%s",
                [second["id"]],
            )
        recovered = gateway.rpc("claim_job", {"p_worker": "recovery-worker"})[0]
        checks["expired_lease_recovered"] = (
            recovered["id"] == second["id"]
            and recovered["attempt"] == 2
            and recovered["lease_token"] != first_lease["lease_token"]
        )
        gateway.rpc(
            "finish_job",
            {
                "p_id": recovered["id"],
                "p_token": recovered["lease_token"],
                "p_status": "succeeded",
                "p_result": {"probe_only": True},
            },
        )
        checks["atomic_completion"] = True
        if args.restart:
            subprocess.run(
                [
                    "docker",
                    "compose",
                    "-f",
                    str(ROOT / "compose.foundation.yaml"),
                    "restart",
                    "db",
                ],
                check=True,
                timeout=30,
                stdout=subprocess.DEVNULL,
            )
            deadline = time.monotonic() + 45
            while True:
                try:
                    with psycopg.connect(DATABASE) as connection:
                        persisted = connection.execute(
                            "SELECT status FROM processing_jobs WHERE id=%s",
                            [recovered["id"]],
                        ).fetchone()
                    checks["database_restart_preserves_completed_job"] = persisted == ("succeeded",)
                    checks["gateway_recovers_after_database_restart"] = (
                        gateway.rpc("readiness")["status"] == "ready"
                    )
                    break
                except (psycopg.OperationalError, GatewayError):
                    if time.monotonic() > deadline:
                        raise
                    time.sleep(1)
    finally:
        gateway.close()
        with psycopg.connect(DATABASE) as connection:
            connection.execute("DELETE FROM processing_jobs WHERE scope=%s", [scope])
    report = {
        "verified_at_utc": datetime.now(UTC).isoformat(),
        "scope": "local_disposable_stack_only",
        "real_hugging_face_connectivity": "not_tested_no_cloud_resources_configured",
        "checks": checks,
        "execution_available": False,
        "limitations": [
            "Persistence primitives tested, not a processing worker or viewer",
            "Local TLS CA; cloud must use its trusted public certificate",
        ],
    }
    output = ROOT / "docs/verification/foundation_report.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    if not all(checks.values()):
        raise SystemExit("Foundation verification failed")


if __name__ == "__main__":
    main()
