from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.gateway import GatewayConflict, GatewayError, GatewayQuota, GatewayRepository
from app.modules.observations.discovery import DiscoveryBusy
from app.modules.observations.provider import ProviderError
from app.modules.observations.router import Service as DiscoveryDependency
from app.modules.views.repository import HTTPSViewRepository, NativeViewRepository
from app.modules.views.schemas import PreparedViewRequest, ViewAcceptance, ViewRequest
from app.modules.views.security import PublicTokens, token_digest
from app.modules.views.service import ViewService

router = APIRouter(tags=["views", "jobs"])


def get_view_repository(db: Annotated[Session, Depends(get_db)]):
    gateway = None
    try:
        settings = get_settings()
        if settings.database_transport == "postgrest":
            gateway = GatewayRepository(settings)
            yield HTTPSViewRepository(gateway)
        else:
            yield NativeViewRepository(db)
    except GatewayConflict as exc:
        raise HTTPException(409, detail={"code": "idempotency_conflict"}) from exc
    except GatewayQuota as exc:
        raise HTTPException(
            429, detail={"code": "view_quota"}, headers={"Retry-After": "60"}
        ) from exc
    except (SQLAlchemyError, GatewayError, OSError, ValueError) as exc:
        raise HTTPException(503, detail={"code": "view_storage_unavailable"}) from exc
    finally:
        if gateway:
            gateway.close()


Repository = Annotated[NativeViewRepository | HTTPSViewRepository, Depends(get_view_repository)]


def session(request, response):
    settings = get_settings()
    try:
        tokens = PublicTokens(settings)
    except ValueError as exc:
        raise HTTPException(503, detail={"code": "public_submission_not_configured"}) from exc
    cookie, scope = tokens.session(request.cookies.get("cosmic_view_client"))
    response.set_cookie(
        "cosmic_view_client",
        cookie,
        max_age=43200,
        httponly=True,
        secure=settings.public_cookie_secure,
        samesite="none" if settings.public_cookie_secure else "lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return tokens, scope


@router.get("/views/session")
def initialize_session(request: Request, response: Response):
    session(request, response)
    return {"status": "ready", "idempotency": "cookie-scoped; preserve this cookie for retries"}


@router.post(
    "/views",
    response_model=ViewAcceptance,
    response_model_exclude_none=True,
    status_code=202,
    responses={
        200: {"description": "Existing request/cache reused"},
        409: {"description": "Idempotency conflict"},
        429: {"description": "Admission quota"},
        503: {"description": "Provider/storage unavailable"},
    },
)
def submit_view(
    query: PreparedViewRequest | ViewRequest,
    request: Request,
    response: Response,
    repository: Repository,
    discovery: DiscoveryDependency,
    key: Annotated[UUID, Header(alias="Idempotency-Key")],
):
    settings = get_settings()
    if request.headers.get("origin") and request.headers["origin"] not in settings.cors_origins:
        raise HTTPException(403, detail={"code": "origin_not_allowed"})
    tokens, scope = session(request, response)
    ip = tokens.digest("ip", request.client.host if request.client else "unknown")
    try:
        result, status = ViewService(repository, discovery, settings, tokens).submit(
            query, scope, ip, str(key)
        )
    except ProviderError as exc:
        raise HTTPException(503, detail={"code": str(exc)}, headers={"Retry-After": "30"}) from exc
    except DiscoveryBusy as exc:
        raise HTTPException(
            429, detail={"code": "discovery_busy"}, headers={"Retry-After": "5"}
        ) from exc
    response.status_code = status
    response.headers["Location"] = result["status_url"]
    return result


@router.get("/views/{view_id}")
@router.get("/jobs/{view_id}")
def view_status(view_id: UUID, repository: Repository, response: Response):
    view = repository.rpc("view_get", {"p_id": str(view_id)})
    if not view:
        raise HTTPException(404, detail={"code": "view_not_found"})
    response.headers["Cache-Control"] = "no-store"
    if view["canonical_request"].get("contract_version") == "derived-v1":
        kind = view["canonical_request"]["kind"]
        view["kind"] = kind
        view["result_url"] = (
            f"/api/v1/{'spectra' if kind == 'spectrum' else 'coadds' if kind == 'coadd' else 'exports' if kind == 'export' else 'differences'}/{view_id}"
        )
        view["delivery_state"] = view["status"]
        return view
    view["manifest_url"] = f"/api/v1/views/{view_id}/manifest"
    view["delivery_state"] = "pending" if view["status"] in ("queued", "running") else "unavailable"
    if (
        view["status"] == "succeeded"
        and view["canonical_request"].get("contract_version") == "view-v2"
    ):
        from app.modules.views.movie_router import movie_record

        try:
            record, _ = movie_record(repository, view_id)
            view["delivery_state"] = record["payload"]["outcome"]
            view["viewer_execution_available"] = bool(
                record["payload"]["timelines"]["common"]["frame_count"]
            )
        except HTTPException as exc:
            if exc.status_code != 410:
                raise
            view["delivery_state"] = "expired"
    return view


@router.post("/views/{view_id}/cancel")
def cancel_view(
    view_id: UUID,
    repository: Repository,
    response: Response,
    authorization: Annotated[str | None, Header()] = None,
):
    if not authorization or not authorization.startswith("Bearer ") or len(authorization) != 71:
        raise HTTPException(404, detail={"code": "view_not_found"})
    view = repository.rpc(
        "view_cancel", {"p_id": str(view_id), "p_digest": token_digest(authorization[7:])}
    )
    if not view:
        raise HTTPException(404, detail={"code": "view_not_found"})
    response.headers["Cache-Control"] = "no-store"
    return view
