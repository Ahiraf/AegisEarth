import hashlib
import threading
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
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
def artifact_content(artifact_id: UUID, repository: Repository, request: Request):
    record = record_or_404(repository, artifact_id)
    etag = '"' + record["sha256"] + '"'
    if (
        etag
        in [
            v.strip().removeprefix("W/")
            for v in request.headers.get("if-none-match", "").split(",")
        ]
        or request.headers.get("if-none-match") == "*"
    ):
        return Response(
            status_code=304, headers={"ETag": etag, "Cache-Control": "private, max-age=60"}
        )
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
    suffix = {
        "image/png": "png",
        "application/json": "json",
        "application/fits": "fits",
        "text/csv": "csv",
        "image/gif": "gif",
    }[content_type]
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


def science_image(stream):
    """Small, deterministic primary 2D FITS for Aladin v3; original MEF stays available."""
    from astropy.io import fits

    with fits.open(stream, memmap=False) as hdus:
        science = hdus["SCIENCE"]
        if science.data.ndim != 2 or max(science.data.shape) > 512:
            raise ValueError("Science image exceeds delivery bounds")
        header = science.header.copy()
        for key in ("CHECKSUM", "DATASUM", "EXTNAME", "XTENSION", "PCOUNT", "GCOUNT"):
            header.remove(key, ignore_missing=True, remove_all=True)
        output = BytesIO()
        fits.PrimaryHDU(science.data, header=header).writeto(output)
        return output.getvalue()


@router.get("/{artifact_id}/science.fits")
def aladin_science(artifact_id: UUID, repository: Repository, request: Request):
    record = record_or_404(repository, artifact_id)
    if record.get("kind") not in (
        "common_grid_planes",
        "temporal_bin_planes",
        "coadd_planes",
        "difference_planes",
        "source_common_grid",
    ):
        raise HTTPException(422, detail={"code": "prepared_common_grid_fits_required"})
    if not DOWNLOAD_SLOTS.acquire(blocking=False):
        raise HTTPException(429, detail={"code": "download_busy"}, headers={"Retry-After": "5"})
    try:
        with get_store(get_settings()).open_verified(record) as stream:
            body = science_image(stream)
    except (StorageError, OSError, ValueError, KeyError) as exc:
        raise HTTPException(503, detail={"code": "artifact_unavailable_or_corrupt"}) from exc
    finally:
        DOWNLOAD_SLOTS.release()
    etag = '"' + hashlib.sha256(body).hexdigest() + '"'
    headers = {
        "ETag": etag,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": f'inline; filename="{artifact_id}-science.fits"',
    }
    if etag in [
        v.strip().removeprefix("W/") for v in request.headers.get("if-none-match", "").split(",")
    ]:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/fits", headers=headers)
