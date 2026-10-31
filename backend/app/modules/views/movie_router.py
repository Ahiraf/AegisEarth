"""Read-only public delivery; first read materializes an immutable source-bound manifest."""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

from app.modules.views.movie import build_movie, fingerprint
from app.modules.views.movie_schemas import MovieFramePage, MovieManifest
from app.modules.views.router import Repository

router = APIRouter(tags=["movies"])


def movie_record(repository, view_id):
    view = repository.rpc("view_get", {"p_id": str(view_id)})
    if not view:
        raise HTTPException(404, detail={"code": "view_not_found"})
    expires_at = view.get("expires_at_utc")
    if expires_at and datetime.fromisoformat(expires_at) <= datetime.now(UTC):
        raise HTTPException(410, detail={"code": "view_expired"})
    if view["status"] in ("queued", "running", "retrying"):
        raise HTTPException(
            202,
            detail={"code": "movie_pending", "status": view["status"]},
            headers={"Retry-After": "2", "Cache-Control": "no-store"},
        )
    if view["status"] != "succeeded":
        raise HTTPException(409, detail={"code": "view_not_successful", "status": view["status"]})
    if not expires_at:
        raise HTTPException(503, detail={"code": "movie_retention_unavailable"})
    record = repository.rpc("movie_lookup", {"p_id": str(view_id)})
    if not record:
        report = repository.rpc("frame_set_get", {"p_id": str(view_id)})
        if report is None:
            raise HTTPException(409, detail={"code": "prepared_view_required"})
        payload = build_movie(view, report)
        record = repository.rpc(
            "movie_publish",
            {
                "p_id": str(view_id),
                "p_report": report,
                "p_payload": payload,
                "p_sha256": fingerprint(payload),
            },
        )
    if not record:
        raise HTTPException(410, detail={"code": "view_expired"})
    remaining = (datetime.fromisoformat(view["expires_at_utc"]) - datetime.now(UTC)).total_seconds()
    return record, max(0, min(60, int(remaining)))


def cached(request, data, etag, ttl):
    headers = {
        "ETag": '"' + etag + '"',
        "Cache-Control": f"private, max-age={ttl}",
        "X-Content-Type-Options": "nosniff",
    }
    # JSON carries preload candidates; the player starts them after first decode.
    candidates = [
        v.strip().removeprefix("W/") for v in request.headers.get("if-none-match", "").split(",")
    ]
    if headers["ETag"] in candidates or "*" in candidates:
        return Response(status_code=304, headers=headers)
    return JSONResponse(data, headers=headers)


@router.get(
    "/views/{view_id}/manifest",
    response_model=MovieManifest,
    responses={
        202: {"description": "Preparation pending"},
        409: {"description": "Failed/canceled or legacy unprepared view"},
        410: {"description": "Expired"},
        304: {"description": "Cached"},
    },
)
def movie_manifest(view_id: UUID, repository: Repository, request: Request):
    record, ttl = movie_record(repository, view_id)
    payload = record["payload"]
    public = {k: v for k, v in payload.items() if k != "frames"} | {
        "manifest_sha256": record["sha256"]
    }
    public = MovieManifest.model_validate(public).model_dump()
    return cached(
        request,
        public,
        fingerprint([record["sha256"], "manifest"]),
        ttl,
    )


@router.get("/views/{view_id}/frames", response_model=MovieFramePage)
def movie_frames(
    view_id: UUID,
    repository: Repository,
    request: Request,
    mode: Literal["common", "native"] = "common",
    offset: int = Query(0, ge=0, le=12),
    limit: int = Query(4, ge=1, le=12),
):
    record, ttl = movie_record(repository, view_id)
    frames = record["payload"]["frames"][mode]
    end = min(offset + limit, len(frames))
    more = (
        f"/api/v1/views/{view_id}/frames?mode={mode}&offset={end}&limit={limit}"
        if end < len(frames)
        else None
    )
    data = MovieFramePage(
        manifest_sha256=record["sha256"],
        view_id=str(view_id),
        mode=mode,
        total=len(frames),
        offset=offset,
        limit=limit,
        items=frames[offset:end],
        next_page=more,
        preload=[f["preview"]["url"] for f in frames[end : end + 2]],
    ).model_dump()
    return cached(request, data, fingerprint([record["sha256"], mode, offset, limit]), ttl)


@router.get("/views/{view_id}/frames/{ordinal}/coordinates")
def frame_coordinates(
    view_id: UUID,
    ordinal: int,
    repository: Repository,
    mode: Literal["common", "native"] = "common",
    origin: Literal["png", "fits"] = "png",
    x: float | None = None,
    y: float | None = None,
    ra: float | None = None,
    dec: float | None = None,
):
    record, _ = movie_record(repository, view_id)
    frames = record["payload"]["frames"][mode]
    if ordinal < 0 or ordinal >= len(frames):
        raise HTTPException(404, detail={"code": "frame_not_found"})
    pixel = x is not None and y is not None and ra is None and dec is None
    sky = ra is not None and dec is not None and x is None and y is None
    values = [v for v in (x, y, ra, dec) if v is not None]
    if not (pixel or sky) or not np.isfinite(values).all():
        raise HTTPException(422, detail={"code": "supply_one_finite_coordinate_pair"})
    spatial = frames[ordinal]["spatial"]
    height, width = spatial["shape"]
    wcs = WCS(fits.Header.fromstring(spatial["wcs_header"], sep="\n")).celestial
    if pixel:
        if not (0 <= x <= width - 1 and 0 <= y <= height - 1):
            raise HTTPException(422, detail={"code": "pixel_outside_frame"})
        ra, dec = map(float, wcs.pixel_to_world_values(x, height - 1 - y if origin == "png" else y))
    else:
        if not (0 <= ra < 360 and -90 <= dec <= 90):
            raise HTTPException(422, detail={"code": "invalid_icrs_degrees"})
        x, y = map(float, wcs.world_to_pixel_values(ra, dec))
        if origin == "png":
            y = height - 1 - y
    if not np.isfinite([x, y, ra, dec]).all():
        raise HTTPException(422, detail={"code": "coordinate_outside_projection"})
    return {
        "frame_id": frames[ordinal]["id"],
        "origin": origin,
        "pixel_base": 0,
        "x": x,
        "y": y,
        "ra_deg": ra,
        "dec_deg": dec,
        "frame": "ICRS",
        "inside": 0 <= x <= width - 1 and 0 <= y <= height - 1,
    }
