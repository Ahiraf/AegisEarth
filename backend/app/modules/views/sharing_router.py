import csv
import io
import json
import re
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, Response
from fastapi.responses import HTMLResponse

from app.core.config import get_settings
from app.modules.observations.discovery import DiscoveryBusy
from app.modules.observations.provider import ProviderError
from app.modules.observations.router import Service as DiscoveryDependency
from app.modules.views.movie_router import movie_record
from app.modules.views.router import Repository, session
from app.modules.views.service import ViewService
from app.modules.views.sharing import (
    ShareState,
    decode,
    encode,
    normalize,
    request_from_canonical,
    viewer_url,
)

router = APIRouter(tags=["sharing"])
ASSETS = Path(__file__).with_name("embed")


@router.post("/share/links")
def create_share_links(state: ShareState):
    state = normalize(state)
    query = encode(state)
    return {
        "state": state.model_dump(mode="json"),
        "query": query,
        "coordinate_url": viewer_url(get_settings().frontend_viewer_url, query),
        "resolve_url": "/api/v1/share/resolve?" + query,
        "reference_viewer_url": "/api/v1/share/viewer?" + query,
        "semantics": "Coordinate URLs re-query current data on explicit submission; normal view quotas apply",
    }


@router.get("/share/resolve")
def resolve_share(request: Request):
    try:
        state = decode(request.url.query)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, detail={"code": "invalid_share_url"}) from exc
    return {
        "state": state.model_dump(mode="json"),
        "canonical_query": encode(state),
        "submit_url": "/api/v1/views",
        "automatic_submission": False,
    }


@router.get("/views/{view_id}/links")
def frozen_links(view_id: UUID, repository: Repository):
    record, _ = movie_record(repository, view_id)
    state = ShareState(request=request_from_canonical(record["payload"]["request"]))
    view = repository.rpc("view_get", {"p_id": str(view_id)})
    return {
        **create_share_links(state),
        "view_id": str(view_id),
        "manifest_sha256": record["sha256"],
        "frozen_viewer_url": viewer_url(get_settings().frontend_viewer_url, "view=" + str(view_id)),
        "embed_path": f"/api/v1/share/embed/{view_id}",
        "reference_frozen_url": f"/api/v1/share/viewer?view={view_id}",
        "manifest_url": f"/api/v1/views/{view_id}/manifest",
        "expires_at_utc": view["expires_at_utc"],
        "warning": "Frozen contents are stable until expiry; links do not guarantee permanent storage",
    }


@router.post("/views/{view_id}/refresh")
def rebuild(
    view_id: UUID,
    request: Request,
    response: Response,
    repository: Repository,
    discovery: DiscoveryDependency,
    key: Annotated[UUID, Header(alias="Idempotency-Key")],
):
    view = repository.rpc("view_get", {"p_id": str(view_id)})
    if not view or view["canonical_request"].get("contract_version") != "view-v2":
        raise HTTPException(404, detail={"code": "prepared_view_request_not_found"})
    settings = get_settings()
    if request.headers.get("origin") and request.headers["origin"] not in settings.cors_origins:
        raise HTTPException(403, detail={"code": "origin_not_allowed"})
    tokens, scope = session(request, response)
    try:
        receipt, status = ViewService(repository, discovery, settings, tokens).submit(
            request_from_canonical(view["canonical_request"]),
            scope,
            tokens.digest("ip", request.client.host if request.client else "unknown"),
            str(key),
            refresh=True,
        )
    except (ProviderError, DiscoveryBusy) as exc:
        raise HTTPException(
            503, detail={"code": "refresh_discovery_unavailable"}, headers={"Retry-After": "30"}
        ) from exc
    response.status_code = status
    response.headers["Location"] = receipt["status_url"]
    return receipt


@router.get("/views/{view_id}/export-metadata")
def export_metadata(view_id: UUID, repository: Repository, format: Literal["json", "csv"] = "json"):
    record, _ = movie_record(repository, view_id)
    payload = record["payload"]
    if format == "json":
        data = json.dumps(
            {"manifest_sha256": record["sha256"], **payload}, allow_nan=False
        ).encode()
        media = "application/json"
    else:
        out = io.StringIO()
        fields = [
            "mode",
            "ordinal",
            "start_utc",
            "end_utc",
            "detectors",
            "unit",
            "preview_url",
            "credits",
            "manifest_sha256",
        ]
        writer = csv.DictWriter(out, fieldnames=fields)
        writer.writeheader()
        for mode, frames in payload["frames"].items():
            for f in frames:
                writer.writerow(
                    {
                        "mode": mode,
                        "ordinal": f["ordinal"],
                        "start_utc": f["time"]["start_utc"],
                        "end_utc": f["time"]["end_utc"],
                        "detectors": ",".join(f["spectral"]["detectors"]),
                        "unit": f["spectral"]["unit"],
                        "preview_url": f["preview"]["url"],
                        "credits": "NASA/IPAC IRSA / SPHEREx; see JSON source DOI and per-frame warnings",
                        "manifest_sha256": record["sha256"],
                    }
                )
        data = out.getvalue().encode()
        media = "text/csv"
    return Response(
        data,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{view_id}-metadata.{format}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/share/embed/{view_id}", response_class=HTMLResponse)
def embed(view_id: UUID, mode: Literal["common", "native"] = "common"):
    ancestors = get_settings().embed_ancestors
    if not ancestors or any(
        not re.fullmatch(r"(?:'self'|https?://[A-Za-z0-9.\-]+(?::\d+)?)", origin)
        for origin in ancestors
    ):
        raise HTTPException(503, detail={"code": "embed_origin_configuration_invalid"})
    html = (
        ASSETS.joinpath("index.html")
        .read_text(encoding="utf-8")
        .replace("__VIEW_ID__", str(view_id))
        .replace("__MODE__", mode)
    )
    return HTMLResponse(
        html,
        headers={
            "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors "
            + " ".join(ancestors),
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/share/viewer", response_class=HTMLResponse)
def reference_viewer():
    return HTMLResponse(
        ASSETS.joinpath("viewer.html").read_text(encoding="utf-8"),
        headers={
            "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; frame-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
        },
    )


@router.get("/share/assets/{name}")
def asset(name: Literal["player.js", "player.css", "entry.js"]):
    return Response(
        ASSETS.joinpath(name).read_bytes(),
        media_type="text/javascript" if name.endswith("js") else "text/css",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300"},
    )
