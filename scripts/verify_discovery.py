"""Live five-target API checks and restricted TLS-gateway parity on the local foundation stack."""

import copy
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
from app.core.gateway import GatewayConflict, GatewayRepository
from app.modules.observations.repository import GatewayDiscoveryRepository
from app.modules.targets.catalog import load_targets


def main():
    report = {"verified_at_utc": datetime.now(UTC).isoformat(), "targets": [], "checks": {}}
    with httpx.Client(base_url="http://127.0.0.1:18000", timeout=150) as client:
        client.get("/api/v1/health/ready").raise_for_status()
        for target in load_targets():
            position = target.search_position("2026-01-01T00:00:00")
            query = {
                "contract_version": "discovery-v1",
                "region": {
                    "ra": position["ra_deg"],
                    "dec": position["dec_deg"],
                    "width_arcmin": 3,
                    "height_arcmin": 3,
                },
                "limit": 7,
            }
            started = time.perf_counter()
            response = client.post("/api/v1/observations/search", json=query)
            response.raise_for_status()
            first_elapsed = time.perf_counter() - started
            first = response.json()
            cached = client.post("/api/v1/observations/search", json=query).json()
            assert cached["snapshot_id"] == first["snapshot_id"] and cached["cache_hit"]
            page, ids, ordered = first, [], []
            while True:
                ids.extend(p["id"] for p in page["items"])
                ordered.extend(
                    (float(p["start_mjd"]), p["exposure_key"], p["id"]) for p in page["items"]
                )
                if not page["next_page"]:
                    break
                followup = client.get(page["next_page"])
                followup.raise_for_status()
                page = followup.json()
            assert len(ids) == len(set(ids)) == first["sampled_count"]
            assert ordered == sorted(ordered)
            if not first["upstream_complete"]:
                assert first["total"] is None
            assert ids, f"No live sample returned for {target.slug}; investigate coverage"
            report["targets"].append(
                {
                    "target": target.slug,
                    "query": query,
                    "snapshot_id": first["snapshot_id"],
                    "sampled_count": first["sampled_count"],
                    "upstream_complete": first["upstream_complete"],
                    "sources": first["sources"],
                    "availability": first["availability"],
                    "first_request_seconds": round(first_elapsed, 3),
                    "first_request_cache_hit": first["cache_hit"],
                    "cache_and_all_pages_verified": True,
                }
            )
            print(
                target.slug,
                first["sampled_count"],
                "complete:",
                first["upstream_complete"],
                flush=True,
            )

        settings = Settings(
            _env_file=None,
            gateway_url="https://localhost:18443",
            gateway_token=local_token(),
            gateway_ca_file=str(ROOT / "var/foundation/root.crt"),
        )
        gateway = GatewayRepository(settings)
        repository = GatewayDiscoveryRepository(gateway)
        try:
            snapshot = repository.find(snapshot_id=report["targets"][0]["snapshot_id"])
            assert snapshot["id"] == report["targets"][0]["snapshot_id"]
            report["checks"]["native_to_https_snapshot_parity"] = True
            product = repository.find(product_id=snapshot["items"][0]["id"])
            assert product["source_metadata"] and product["id"] == snapshot["items"][0]["id"]
            report["checks"]["immutable_product_detail_via_tls"] = True
            clone = copy.deepcopy(snapshot)
            clone["id"] = str(uuid4())
            clone["canonical_query"]["verification"] = clone["id"]
            clone["query_hash"] = hashlib.sha256(
                json.dumps(clone["canonical_query"], sort_keys=True).encode()
            ).hexdigest()
            repository.save(clone, [product])
            assert repository.find(snapshot_id=clone["id"]) == clone
            assert repository.find(query_hash=clone["query_hash"])["id"] == clone["id"]
            report["checks"]["atomic_https_save_roundtrip"] = True
            clone["id"] = str(uuid4())
            try:
                repository.save(clone, [{**product, "detector": "D0_INVALID"}])
            except GatewayConflict:
                pass
            else:
                raise AssertionError("Gateway overwrote an immutable product")
            assert repository.find(snapshot_id=clone["id"]) is None
            assert repository.find(product_id=product["id"]) == product
            report["checks"]["immutable_conflict_transaction_rollback"] = True
        finally:
            gateway.close()
    path = ROOT / "docs/verification/discovery_report.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("Saved", path.relative_to(ROOT), flush=True)


if __name__ == "__main__":
    main()
