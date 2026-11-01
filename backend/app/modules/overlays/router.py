from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query, Response

from app.core.config import get_settings
from app.modules.overlays.provider import ContextProvider, OverlayUnavailable
from app.modules.overlays.service import cached, catalogs, image_layer
from app.modules.views.movie_router import movie_record
from app.modules.views.router import Repository

router = APIRouter(tags=["overlays"])


def context(repository, view_id, mode, ordinal):
    record, _ = movie_record(repository, view_id)
    if ordinal >= len(record["payload"]["frames"][mode]):
        raise HTTPException(404, detail={"code": "frame_not_found"})
    return record


@router.get("/views/{view_id}/overlays/catalogs")
def catalog_layer(
    view_id: UUID,
    repository: Repository,
    response: Response,
    survey: Literal["gaia", "wise"] = "gaia",
    mode: Literal["common", "native"] = "common",
    ordinal: int = Query(0, ge=0, le=11),
    limit: int = Query(100, ge=1, le=500),
    propagate: bool = True,
):
    record = context(repository, view_id, mode, ordinal)
    settings = get_settings()
    try:
        result, hit = cached(
            (record["sha256"], mode, ordinal, survey, limit, propagate),
            lambda: catalogs(
                ContextProvider(settings),
                record["payload"],
                mode,
                ordinal,
                survey,
                limit,
                propagate,
            ),
            settings.overlay_ttl_seconds,
        )
        response.headers["Cache-Control"] = "no-store"
        return {**result, "cache_hit": hit, "manifest_sha256": record["sha256"]}
    except (OverlayUnavailable, ValueError, KeyError) as exc:
        response.status_code = 503
        response.headers["Retry-After"] = "30"
        return {
            "status": "unavailable",
            "code": str(exc) if isinstance(exc, OverlayUnavailable) else "overlay_schema_error",
            "markers": [],
            "viewer_remains_available": True,
        }


@router.get("/views/{view_id}/overlays/wise/{band}")
def wise_layer(
    view_id: UUID,
    repository: Repository,
    band: int = Path(ge=1, le=2),
    mode: Literal["common", "native"] = "common",
    ordinal: int = Query(0, ge=0, le=11),
    format: Literal["json", "png", "fits"] = "json",
):
    record = context(repository, view_id, mode, ordinal)
    settings = get_settings()
    try:
        result, hit = cached(
            (record["sha256"], mode, ordinal, "wise_image", band),
            lambda: image_layer(ContextProvider(settings), record["payload"], mode, ordinal, band),
            settings.overlay_ttl_seconds,
        )
    except (OverlayUnavailable, ValueError, KeyError, OSError) as exc:
        raise HTTPException(
            503,
            detail={
                "code": str(exc)
                if isinstance(exc, OverlayUnavailable)
                else "wise_image_unavailable",
                "viewer_remains_available": True,
            },
            headers={"Retry-After": "30"},
        ) from exc
    if format == "json":
        return {
            **result["metadata"],
            "cache_hit": hit,
            "manifest_sha256": record["sha256"],
            "png_url": f"/api/v1/views/{view_id}/overlays/wise/{band}?mode={mode}&ordinal={ordinal}&format=png",
            "fits_url": f"/api/v1/views/{view_id}/overlays/wise/{band}?mode={mode}&ordinal={ordinal}&format=fits",
        }
    import hashlib

    data = result[format]
    return Response(
        data,
        media_type="image/png" if format == "png" else "application/fits",
        headers={
            "Cache-Control": "private, max-age=60",
            "ETag": '"' + hashlib.sha256(data).hexdigest() + '"',
            "X-Content-Type-Options": "nosniff",
        },
    )
