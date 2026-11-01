from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Header, Request, Response
from pydantic import Field

from app.modules.analyses.derived_http import admit, result_for
from app.modules.analyses.derived_schemas import DerivedAcceptance
from app.modules.coadds.schemas import Inputs
from app.modules.observations.router import Service as DiscoveryDependency
from app.modules.views.router import Repository

router = APIRouter(tags=["exports"])


class MovieExportRequest(Inputs):
    contract_version: Literal["export-v1"] = "export-v1"
    frame_duration_ms: int = Field(700, ge=100, le=2000)
    loop: bool = False


@router.post(
    "/views/{view_id}/exports",
    status_code=202,
    response_model=DerivedAcceptance,
    response_model_exclude_none=True,
)
def submit_export(
    view_id: UUID,
    query: MovieExportRequest,
    request: Request,
    response: Response,
    repository: Repository,
    discovery: DiscoveryDependency,
    key: Annotated[UUID, Header(alias="Idempotency-Key")],
):
    return admit(view_id, query, "export", request, response, repository, discovery, key)


@router.get("/exports/{identifier}")
def export_result(identifier: UUID, repository: Repository, response: Response):
    return result_for(identifier, "export", repository, response)
