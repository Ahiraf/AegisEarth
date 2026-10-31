import threading
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.core.config import get_settings
from app.modules.artifacts.storage import StorageError, get_store
from app.modules.views.router import Repository

router = APIRouter(prefix="/artifacts", tags=["artifacts"])
DOWNLOAD_SLOTS = threading.BoundedSemaphore(2)


def record_or_404(repository, artifact_id):
    record = repository.rpc("view_artifact", {"p_id": str(artifact_id)})
    if not record:
        raise HTTPException(404, detail={"code": "artifact_not_found_or_expired"})
    return record


@router.get("/{artifact_id}")
def artifact_metadata(artifact_id: UUID, repository: Repository):
    record = record_or_404(repository, artifact_id)
    return {k: v for k, v in record.items() if k != "storage_key"} | {
        "download_url": f"/api/v1/artifacts/{artifact_id}/content"
    }


@router.get("/{artifact_id}/content")
def artifact_content(artifact_id: UUID, repository: Repository):
    record = record_or_404(repository, artifact_id)
    if not DOWNLOAD_SLOTS.acquire(blocking=False):
        raise HTTPException(429, detail={"code": "download_busy"}, headers={"Retry-After": "5"})
    manager = None
    try:
        manager = get_store(get_settings()).open_verified(record)
        stream = manager.__enter__()
    except (StorageError, OSError, ValueError) as exc:
        DOWNLOAD_SLOTS.release()
        raise HTTPException(503, detail={"code": "artifact_unavailable_or_corrupt"}) from exc
    lock = threading.Lock()
    closed = False

    def close():
        nonlocal closed
        with lock:
            if not closed:
                closed = True
                try:
                    manager.__exit__(None, None, None)
                finally:
                    DOWNLOAD_SLOTS.release()

    def chunks():
        try:
            while chunk := stream.read(65536):
                yield chunk
        finally:
            close()

    content_type = record.get("content_type", "application/fits")
    suffix = {"image/png": "png", "application/json": "json", "application/fits": "fits"}[
        content_type
    ]
    return StreamingResponse(
        chunks(),
        media_type=content_type,
        background=BackgroundTask(close),
        headers={
            "Content-Length": str(record["size_bytes"]),
            "ETag": '"' + record["sha256"] + '"',
            "Cache-Control": "private, max-age=60",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'inline; filename="{artifact_id}.{suffix}"'
            if suffix == "png"
            else f'attachment; filename="{artifact_id}.{suffix}"',
        },
    )
