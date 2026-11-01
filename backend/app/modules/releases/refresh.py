"""Bounded scheduler/admin primitive; deployments run the CLI from an external scheduler."""

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from app.modules.observations.discovery import DiscoveryBusy, canonical_query
from app.modules.observations.provider import ProviderError
from app.modules.releases.registry import REGISTRY_VERSION


def refresh(repository, discovery, query, settings):
    key = hashlib.sha256(json.dumps(canonical_query(query), sort_keys=True).encode()).hexdigest()
    claim = repository.rpc(
        "release_refresh_claim", {"p_hash": key, "p_cooldown": settings.refresh_cooldown_seconds}
    )
    if not claim["claimed"]:
        return {"status": "cooldown", "query_hash": key, "previous": claim["payload"]}
    try:
        result = discovery.search(query, force=True)
        report = {
            "status": "checked",
            "snapshot_id": result["snapshot_id"],
            "registry_version": REGISTRY_VERSION,
            "checked_at_utc": datetime.now(UTC).isoformat(),
            "sampled_count": result["sampled_count"],
            "upstream_complete": result["upstream_complete"],
            "sources": result["sources"],
            "warnings": result["warnings"],
        }
    except (ProviderError, DiscoveryBusy) as exc:
        report = {
            "status": "unavailable",
            "registry_version": REGISTRY_VERSION,
            "checked_at_utc": datetime.now(UTC).isoformat(),
            "error": str(exc) if isinstance(exc, ProviderError) else "discovery_busy",
        }
    repository.rpc(
        "release_refresh_finish", {"p_hash": key, "p_token": claim["token"], "p_report": report}
    )
    return {"query_hash": key, **report}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--request-file", type=Path, required=True, help="JSON list of 1-5 discovery-v1 requests"
    )
    args = parser.parse_args()
    if args.request_file.stat().st_size > 32768:
        raise SystemExit("Refresh request-file exceeds bound")
    from app.core.config import get_settings
    from app.core.database import SessionLocal
    from app.modules.observations.discovery import DiscoveryService
    from app.modules.observations.provider import SIAProvider
    from app.modules.observations.repository import DiscoveryRepository
    from app.modules.observations.schemas import DiscoverySearch
    from app.modules.views.repository import NativeViewRepository

    items = json.loads(args.request_file.read_text())
    if not isinstance(items, list) or not 1 <= len(items) <= 5:
        raise SystemExit("Supply 1-5 bounded discovery requests")
    queries = [DiscoverySearch.model_validate(item) for item in items]
    settings = get_settings()
    if settings.database_transport != "postgresql":
        raise SystemExit("Scheduler CLI requires native PostgreSQL")
    with SessionLocal() as session:
        discovery = DiscoveryService(
            DiscoveryRepository(session),
            SIAProvider(settings),
            ttl_seconds=settings.discovery_ttl_seconds,
        )
        for query in queries:
            print(
                json.dumps(refresh(NativeViewRepository(session), discovery, query, settings)),
                flush=True,
            )


if __name__ == "__main__":
    main()
