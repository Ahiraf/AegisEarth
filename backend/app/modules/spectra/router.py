from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Request, Response

from app.modules.analyses.derived_http import admit, result_for
from app.modules.analyses.derived_schemas import DerivedAcceptance
from app.modules.observations.router import Service as DiscoveryDependency
from app.modules.spectra.schemas import SpectrumRequest
from app.modules.views.router import Repository

router = APIRouter(tags=["spectra"])


@router.post(
    "/views/{view_id}/spectra",
    status_code=202,
    response_model=DerivedAcceptance,
    response_model_exclude_none=True,
)
def spectrum(
    view_id: UUID,
    query: SpectrumRequest,
    request: Request,
    response: Response,
    repository: Repository,
    discovery: DiscoveryDependency,
    key: Annotated[UUID, Header(alias="Idempotency-Key")],
):
    return admit(view_id, query, "spectrum", request, response, repository, discovery, key)


@router.get("/spectra/{identifier}")
def spectrum_result(identifier: UUID, repository: Repository, response: Response):
    return result_for(identifier, "spectrum", repository, response)
