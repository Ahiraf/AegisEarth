from fastapi import HTTPException

from app.core.config import get_settings
from app.modules.analyses.derived_service import submit
from app.modules.views.router import session


def admit(primary, query, kind, request, response, repository, discovery, key):
    settings = get_settings()
    if request.headers.get("origin") and request.headers["origin"] not in settings.cors_origins:
        raise HTTPException(403, detail={"code": "origin_not_allowed"})
    tokens, scope = session(request, response)
    result, status = submit(
        repository,
        discovery.repository,
        primary,
        query,
        kind,
        settings,
        tokens,
        scope,
        tokens.digest("ip", request.client.host if request.client else "unknown"),
        key,
    )
    response.status_code = status
    response.headers["Location"] = result["status_url"]
    return result


def result_for(identifier, kind, repository, response):
    view = repository.rpc("view_get", {"p_id": str(identifier)})
    if not view or view["canonical_request"].get("kind") != kind:
        raise HTTPException(404, detail={"code": "derived_job_not_found"})
    response.headers["Cache-Control"] = "no-store"
    if view["status"] in ("queued", "running"):
        response.status_code = 202
        response.headers["Retry-After"] = "2"
        return {"id": str(identifier), "status": view["status"]}
    if view["status"] != "succeeded":
        raise HTTPException(
            409, detail={"code": "derived_job_failed_or_canceled", "error_code": view["error_code"]}
        )
    report = repository.rpc("frame_set_get", {"p_id": str(identifier)})
    if report is None:
        raise HTTPException(410, detail={"code": "derived_result_expired"})
    return report
