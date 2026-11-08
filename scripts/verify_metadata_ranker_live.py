"""Run a real, optional ranker job against a disposable local PostgreSQL database.

Never transfers verification records to production. Uses real IRSA/SkyBoT services,
the API admission contract, durable worker and the candidates table; no mock fallback.
"""

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.modules.candidates.models import Candidate
from app.modules.observations.discovery import DiscoveryService
from app.modules.observations.provider import SIAProvider
from app.modules.observations.repository import DiscoveryRepository
from app.modules.observations.schemas import DiscoverySearch
from app.modules.ranking.schemas import MetadataRankerRequest
from app.modules.ranking.service import submit
from app.modules.ranking.visits import select_visit
from app.modules.views.repository import NativeViewRepository
from app.modules.views.security import PublicTokens
from app.modules.views.worker import process_job


def run_and_record(session, settings, identifier, report):
    started = time.monotonic()

    class VerificationRepository(NativeViewRepository):
        def rpc(self, method, parameters=None):
            try:
                result = super().rpc(method, parameters)
                if method == "view_heartbeat":
                    report["heartbeat_count"] = report.get("heartbeat_count", 0) + 1
                    report["last_heartbeat_wall_seconds"] = time.monotonic() - started
                return result
            except Exception as exc:
                report.setdefault("worker_rpc_errors", []).append(
                    {
                        "method": method,
                        "type": type(exc).__name__,
                        "database_code": getattr(
                            getattr(exc.__cause__, "orig", None), "sqlstate", None
                        ),
                        "database_reason": getattr(
                            getattr(getattr(exc.__cause__, "orig", None), "diag", None),
                            "message_primary",
                            None,
                        ),
                    }
                )
                raise

    repository = VerificationRepository(session)
    for _ in range(2):
        result = repository.rpc("ranker_get", {"p_id": identifier})
        if not result or result["status"] != "queued":
            break
        job = repository.rpc("claim_view_job", {"p_worker": "ranker-live-check", "p_capacity": 2})
        if not job:
            time.sleep(6)
            job = repository.rpc(
                "claim_view_job", {"p_worker": "ranker-live-check", "p_capacity": 2}
            )
        if not job or job["id"] != identifier:
            raise RuntimeError("Expected the admitted job in the disposable queue")
        report.setdefault("worker_attempts", []).append(process_job(repository, job, settings))
    report["analysis"] = repository.rpc("ranker_get", {"p_id": identifier})
    rows = session.scalars(select(Candidate).where(Candidate.analysis_id == identifier)).all()
    report["persisted_candidates"] = [
        {
            "id": c.id,
            "classification": c.classification,
            "score": c.score,
            "score_uncertainty": c.score_uncertainty,
            "warnings": c.warnings,
            "score_kind": c.score_kind,
            "model_version_id": c.model_version_id,
        }
        for c in rows
    ]
    report["accepted"] = report["analysis"]["status"] == "succeeded"
    report["worker_wall_seconds"] = time.monotonic() - started
    result = report["analysis"].get("result")
    if result:
        report["cutout_downloads"] = result.get("acquisition", {}).get("cutout_downloads")
        report["bright_candidates"] = [
            {
                "name": c["name"],
                "v_mag": c["evidence"]["v_mag"],
                "score": c["score"],
                "n_frames_used": c["evidence"]["n_frames_used"],
                "frames": c["evidence"]["frames"],
            }
            for c in result["candidates"]
            if c["evidence"]["v_mag"] is not None and c["evidence"]["v_mag"] <= 18.1
        ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ra", type=float, default=324.329)
    parser.add_argument("--dec", type=float, default=-18.398)
    parser.add_argument("--start", default="2026-05-26T00:00:00Z")
    parser.add_argument("--end", default="2026-05-28T00:00:00Z")
    parser.add_argument("--collection", action="append", default=None)
    parser.add_argument("--resume", default=None, help="Previous local verification job UUID")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "docs/verification/metadata_ranker_live.json"
    )
    args = parser.parse_args()
    started = time.monotonic()
    settings = get_settings()
    database = make_url(settings.database_url)
    if (
        database.host not in {"127.0.0.1", "localhost", "host.docker.internal"}
        or "test" not in database.database
    ):
        raise SystemExit("Use an explicitly named disposable local test database")
    if not settings.metadata_ranker_enabled:
        raise SystemExit("Set METADATA_RANKER_ENABLED=true for this opt-in verification")
    report = {
        "verified_at_utc": datetime.now(UTC).isoformat(),
        "fixture_fallback": False,
        "search": {
            "ra_deg": args.ra,
            "dec_deg": args.dec,
            "start_at": args.start,
            "end_at": args.end,
        },
    }
    try:
        with SessionLocal() as session:
            if args.resume:
                report = json.loads(args.output.read_text(encoding="utf-8"))
                run_and_record(session, settings, args.resume, report)
                args.output.write_text(
                    json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8"
                )
                print(
                    "Live ranker accepted:", report["accepted"], "Report:", args.output, flush=True
                )
                return 0 if report["accepted"] else 1
            discovery_repository = DiscoveryRepository(session)
            discovery = DiscoveryService(discovery_repository, SIAProvider(settings))
            page = discovery.search(
                DiscoverySearch(
                    contract_version="discovery-v1",
                    region={
                        "ra": args.ra,
                        "dec": args.dec,
                        "width_arcmin": 15,
                        "height_arcmin": 15,
                    },
                    start_at=args.start,
                    end_at=args.end,
                    collections=args.collection
                    or ["spherex_qr3", "spherex_qr3_deep", "spherex_qr2", "spherex_qr2_deep"],
                    limit=100,
                )
            )
            snapshot = discovery_repository.find(snapshot_id=page["snapshot_id"])
            report["discovery"] = {
                "snapshot_id": snapshot["id"],
                "count": len(snapshot["items"]),
                "sources": snapshot["sources"],
                "warnings": snapshot["warnings"],
            }
            index = 0
            while True:
                try:
                    selected = select_visit(snapshot["items"], index, 12)
                    break
                except ValueError:
                    index += 1
                    if index > len(snapshot["items"]):
                        raise ValueError(
                            "No visit has six native exposure/detector products"
                        ) from None
            repository = NativeViewRepository(session)
            tokens = PublicTokens(settings)
            accepted, _ = submit(
                MetadataRankerRequest(
                    contract_version="metadata-ranker-v1",
                    snapshot_id=snapshot["id"],
                    visit_index=index,
                ),
                repository,
                discovery_repository,
                settings,
                tokens,
                tokens.digest("scope", "local-ranker-verification"),
                tokens.digest("ip", "127.0.0.1"),
                uuid4(),
            )
            report["selected_product_ids"] = [p["id"] for p in selected]
            print(f"Queued {accepted['id']} with {len(selected)} native cutouts", flush=True)
            run_and_record(session, settings, accepted["id"], report)
    except Exception as exc:  # noqa: BLE001 -- persist a truthful external verification failure
        report["accepted"] = False
        report["error"] = type(exc).__name__ + ": " + str(exc)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    report["total_wall_seconds"] = time.monotonic() - started
    result = report.get("analysis", {}).get("result")
    if result is not None:
        args.output.with_name(args.output.stem + "_result.json").write_text(
            json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8"
        )
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print("Live ranker accepted:", report["accepted"], "Report:", args.output, flush=True)
    return 0 if report["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
