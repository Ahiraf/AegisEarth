"""Verify only the local TLS gateway's public view RPC path; never print capability tokens."""

import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from verify_foundation import local_token

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import Settings
from app.core.gateway import GatewayRepository
from app.modules.views.repository import HTTPSViewRepository
from app.modules.views.service import digest, policy


def main():
    evidence = json.loads((ROOT / "docs/verification/views_report.json").read_text())
    settings = Settings(
        _env_file=None,
        gateway_url="https://localhost:18443",
        gateway_token=local_token(),
        gateway_ca_file=str(ROOT / "var/foundation/root.crt"),
    )
    gateway = GatewayRepository(settings)
    repo = HTTPSViewRepository(gateway)
    checks = {}
    try:
        view = repo.rpc("view_get", {"p_id": evidence["view_id"]})
        assert view["status"] == "succeeded" and view["result"] == evidence["result"]
        checks["native_view_read_via_authenticated_tls"] = True
        file = repo.rpc("view_artifact", {"p_id": evidence["artifacts"][0]["id"]})
        assert file["sha256"] == evidence["artifacts"][0]["sha256"]
        checks["committed_artifact_lookup"] = True
        snapshot = gateway.rpc("discovery_lookup", {"p_snapshot_id": view["snapshot_id"]})
        product = next(p for p in snapshot["items"] if p["id"] == file["product_id"])
        identifier = str(uuid4())
        scope = digest(identifier)
        key = digest(str(uuid4()))
        request_hash = digest(
            {k: v for k, v in view["canonical_request"].items() if k != "selection"}
        )
        params = {
            "p_id": identifier,
            "p_scope": scope,
            "p_ip": digest("gateway-local-verification"),
            "p_key": key,
            "p_hash": request_hash,
            "p_digest": hashlib.sha256(identifier.encode()).hexdigest(),
            "p_cache": digest(identifier),
            "p_snapshot": view["snapshot_id"],
            "p_canonical": view["canonical_request"],
            "p_products": [product],
            "p_policy": policy(settings),
        }
        repo.rpc(
            "view_preflight",
            {"p_scope": scope, "p_ip": params["p_ip"], "p_policy": policy(settings)},
        )
        accepted = repo.rpc("view_submit", params)
        try:
            assert accepted["id"] == identifier and accepted["created"]
            replay = repo.rpc(
                "view_replay", {"p_scope": scope, "p_key": key, "p_hash": request_hash}
            )
            assert replay["id"] == identifier
            checks["transactional_tls_admission_and_replay"] = True
        finally:
            canceled = repo.rpc("view_cancel", {"p_id": identifier, "p_digest": params["p_digest"]})
            assert canceled["status"] == "canceled" and not canceled["artifacts"]
        checks["capability_scoped_tls_cancellation"] = True
    finally:
        gateway.close()
    path = ROOT / "docs/verification/views_gateway_report.json"
    path.write_text(
        json.dumps({"verified_at_utc": datetime.now(UTC).isoformat(), "checks": checks}, indent=2)
        + "\n"
    )
    print("Verified", len(checks), "local TLS view checks", flush=True)


if __name__ == "__main__":
    main()
