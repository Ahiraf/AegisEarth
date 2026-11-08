"""Native PostgreSQL worker with fenced leases and an isolated, resource-monitored FITS child."""

import argparse
import contextlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import psutil
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.gateway import GatewayConflict
from app.modules.artifacts.storage import StorageError, get_store
from app.modules.views.repository import NativeViewRepository


class WorkerLimit(Exception):
    pass


def resource_guard(process, started, limits, root):
    if time.monotonic() - started > limits["wall_seconds"]:
        raise WorkerLimit("wall_time_exceeded")
    try:
        parent = psutil.Process(process.pid)
        children = [parent, *parent.children(recursive=True)]
        memory = sum(p.memory_info().rss for p in children if p.is_running())
        cpu = sum(p.cpu_times().user + p.cpu_times().system for p in children if p.is_running())
        if memory > limits["memory_mb"] * 1024**2:
            raise WorkerLimit("memory_limit_exceeded")
        if cpu > limits["cpu_seconds"]:
            raise WorkerLimit("cpu_limit_exceeded")
    except psutil.NoSuchProcess:
        pass
    size = sum(p.stat().st_size for p in root.iterdir() if p.is_file())
    if size > limits["total_bytes"] + 1048576:
        raise WorkerLimit("disk_limit_exceeded")


def stop_child(process):
    if process and process.poll() is None:
        process.kill()
        process.wait(timeout=10)


def process_job(repository, job, settings):
    stage_root = (Path(settings.artifact_root) / "staging").resolve()
    stage_root.mkdir(parents=True, exist_ok=True)
    root = stage_root / (job["id"] + "_" + job["lease_token"])
    root.mkdir(exist_ok=False)
    job = {
        **job,
        "storage": {
            "artifact_root": settings.artifact_root,
            "object_store": settings.object_store,
            "s3_bucket": settings.s3_bucket,
            "s3_endpoint_url": settings.s3_endpoint_url,
            "s3_region": settings.s3_region,
        },
    }
    (root / "job.json").write_text(json.dumps(job, default=str))
    parameters = {"p_id": job["id"], "p_token": job["lease_token"]}
    limits = job["config"]["limits"]
    process = None
    receipts = {}
    prepared = None
    derived = []
    ranker_report = None
    started = time.monotonic()
    heartbeat_at = 0
    try:
        if job["config"].get("ranker") and not settings.metadata_ranker_enabled:
            raise WorkerLimit("metadata_ranker_disabled")
        environment = {**os.environ, "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1"}
        process = subprocess.Popen(
            [sys.executable, "-m", "app.modules.views.executor", str(root)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=environment,
        )
        while True:
            resource_guard(process, started, limits, root)
            if time.monotonic() - heartbeat_at >= 1:
                repository.rpc("view_heartbeat", parameters)
                heartbeat_at = time.monotonic()
            for index in range(len(job["config"]["products"])):
                path = root / f"{index}.json"
                if index not in receipts and path.exists():
                    if path.stat().st_size > 65536:
                        raise WorkerLimit("receipt_limit_exceeded")
                    receipt = json.loads(path.read_text())
                    repository.rpc(
                        "view_pin",
                        {
                            **parameters,
                            "p_product": receipt["product_id"],
                            "p_sha": receipt["sha256"],
                        },
                    )
                    file = {
                        **receipt,
                        "id": str(uuid4()),
                        "view_id": job["id"],
                        "content_type": "application/fits",
                        "cache_key": __import__("hashlib")
                        .sha256(
                            (
                                receipt["product_id"] + receipt["source_url"] + receipt["sha256"]
                            ).encode()
                        )
                        .hexdigest(),
                        "storage_key": f"objects/{job['id']}/{job['lease_token']}/{receipt['sha256']}.fits",
                    }
                    repository.rpc("view_prepare_upload", {**parameters, "p_file": file})
                    acknowledgment = root / f"{index}.upload.part"
                    acknowledgment.write_text(json.dumps(file))
                    acknowledgment.replace(root / f"{index}.upload.json")
                    receipts[index] = file
            ready = root / "preparation.json"
            if ready.exists() and prepared is None:
                if ready.stat().st_size > 600000:
                    raise WorkerLimit("prepared_report_limit")
                payload = json.loads(ready.read_text(encoding="utf-8"))
                if len(payload["files"]) > 64:
                    raise WorkerLimit("prepared_artifact_limit")
                import re

                for receipt in payload["files"]:
                    name = receipt["path"]
                    if not re.fullmatch(
                        r"(?:(?:native|common|bin)_\d+\.png|(?:planes|bin)_\d+\.fits|preparation_report\.json)"
                        if not job["config"].get("derived")
                        else r"(?:input_\d+\.fits|result_\d+\.(?:png|fits)|spectrum\.csv|derived_report\.json|movie\.gif|export_provenance\.json)",
                        name,
                    ):
                        raise WorkerLimit("invalid_prepared_path")
                    extension = name.rsplit(".", 1)[1]
                    file = {
                        **receipt,
                        "id": str(uuid4()),
                        "view_id": job["id"],
                        "storage_key": f"objects/{job['id']}/{job['lease_token']}/{receipt['sha256']}.{extension}",
                    }
                    repository.rpc("prepare_frame_upload", {**parameters, "p_file": file})
                    derived.append(file)
                prepared = payload["report"]
                prepared["artifacts"] = [
                    {k: v for k, v in f.items() if k not in {"storage_key", "path"}}
                    for f in derived
                ]
                ack = root / "preparation.upload.part"
                ack.write_text(json.dumps(derived), encoding="utf-8")
                ack.replace(root / "preparation.upload.json")
            ranking = root / "ranker.json"
            if ranking.exists() and ranker_report is None:
                if ranking.stat().st_size > 256000:
                    raise WorkerLimit("ranker_result_limit")
                ranker_report = json.loads(ranking.read_text(encoding="utf-8"))
            if process.poll() is not None:
                break
            time.sleep(0.2)
        if not (root / "result.json").exists():
            raise WorkerLimit("child_process_failed")
        result = json.loads((root / "result.json").read_text())
        if not result["ok"]:
            raise WorkerLimit(result["error_code"])
        if len(receipts) != len(job["config"]["products"]):
            raise WorkerLimit("incomplete_acquisition")
        files = [record for _, record in sorted(receipts.items())]
        if time.monotonic() - started > limits["wall_seconds"]:
            raise WorkerLimit("wall_time_exceeded")
        repository.rpc("view_heartbeat", parameters)
        if job["config"].get("ranker"):
            if ranker_report is None:
                raise WorkerLimit("missing_ranker_result")
            repository.rpc(
                "ranker_complete",
                {**parameters, "p_files": files, "p_report": ranker_report},
            )
        elif job["config"].get("preparation") or job["config"].get("derived"):
            if prepared is None:
                raise WorkerLimit("missing_preparation_result")
            repository.rpc(
                "complete_prepared_view",
                {**parameters, "p_files": files, "p_derived": derived, "p_report": prepared},
            )
        else:
            repository.rpc("complete_view", {**parameters, "p_files": files})
        return "succeeded"
    except GatewayConflict:
        # Cancellation/reclaim or changed pinned source: a stale worker can never publish.
        with contextlib.suppress(GatewayConflict):
            repository.rpc(
                "fail_view", {**parameters, "p_code": "lease_or_source_changed", "p_retry": False}
            )
        return "fenced"
    except (WorkerLimit, StorageError, OSError, ValueError) as exc:
        code = str(exc) if isinstance(exc, (WorkerLimit, StorageError)) else "worker_io_failed"
        with contextlib.suppress(GatewayConflict):
            repository.rpc(
                "fail_view",
                {
                    **parameters,
                    "p_code": code,
                    "p_retry": code
                    in {"source_unavailable", "object_store_unavailable", "worker_io_failed"},
                },
            )
        return "failed"
    finally:
        stop_child(process)
        resolved = root.resolve()
        if resolved.parent == stage_root and not root.is_symlink():
            shutil.rmtree(resolved)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Claim at most one acquisition job")
    parser.add_argument(
        "--cleanup", action="store_true", help="Bounded expired/orphan object cleanup"
    )
    parser.add_argument("--cursor", default=None)
    args = parser.parse_args()
    settings = get_settings()
    if settings.database_transport != "postgresql":
        raise SystemExit("The durable worker requires native PostgreSQL")
    if args.cleanup:
        from app.modules.artifacts.cleanup import cleanup

        with SessionLocal() as session:
            print(json.dumps(cleanup(session, get_store(settings), settings, cursor=args.cursor)))
        return
    worker_id = "worker-" + str(uuid4())
    while True:
        try:
            with SessionLocal() as session:
                repository = NativeViewRepository(session)
                # Viewer processing continues when optional model dependencies are absent.
                job = repository.rpc(
                    "claim_view_job",
                    {"p_worker": worker_id, "p_capacity": settings.view_max_workers},
                )
                if job:
                    print(job["id"], process_job(repository, job, settings), flush=True)
        except SQLAlchemyError:
            print("worker_database_unavailable; lease recovery will retry", flush=True)
        if args.once:
            return
        time.sleep(2)


if __name__ == "__main__":
    main()
