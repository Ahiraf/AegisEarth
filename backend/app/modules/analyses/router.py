from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, Response

from app.core.config import get_settings
from app.core.errors import FeatureUnavailable
from app.modules.analyses.schemas import AnalysisRequest
from app.modules.observations.router import Service as DiscoveryDependency
from app.modules.ranking.schemas import MetadataRankerRequest
from app.modules.ranking.service import submit
from app.modules.views.router import Repository, session

router = APIRouter(prefix="/analyses", tags=["analyses"])


@router.post(
    "",
    responses={
        202: {"description": "Optional ranker job durably queued"},
        503: {"description": "Legacy analysis or optional ranker unavailable"},
    },
)
def submit_analysis(
    query: MetadataRankerRequest | AnalysisRequest,
    request: Request,
    response: Response,
    repository: Repository,
    discovery: DiscoveryDependency,
    key: Annotated[UUID | None, Header(alias="Idempotency-Key")] = None,
):
    if isinstance(query, AnalysisRequest):
        raise FeatureUnavailable("Image analysis execution")
    settings = get_settings()
    if request.headers.get("origin") and request.headers["origin"] not in settings.cors_origins:
        raise HTTPException(403, detail={"code": "origin_not_allowed"})
    if key is None:
        raise HTTPException(422, detail={"code": "idempotency_key_required"})
    tokens, scope = session(request, response)
    accepted, status = submit(
        query,
        repository,
        discovery.repository,
        settings,
        tokens,
        scope,
        tokens.digest("ip", request.client.host if request.client else "unknown"),
        key,
    )
    response.status_code = status
    response.headers["Location"] = accepted["status_url"]
    return accepted


@router.get("/{analysis_id}", responses={202: {"description": "Ranker job queued or running"}})
def analysis_result(analysis_id: UUID, repository: Repository, response: Response):
    result = repository.rpc("ranker_get", {"p_id": str(analysis_id)})
    if result is None:
        raise HTTPException(404, detail={"code": "analysis_not_found"})
    response.headers["Cache-Control"] = "no-store"
    if result["status"] in ("queued", "running"):
        response.status_code = 202
        response.headers["Retry-After"] = "3"
    return result
