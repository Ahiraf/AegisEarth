from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, Response

from app.modules.analyses.derived_http import admit, result_for
from app.modules.analyses.derived_schemas import DerivedAcceptance
from app.modules.coadds.schemas import CoaddRequest
from app.modules.observations.router import Service as DiscoveryDependency
from app.modules.views.router import Repository

router = APIRouter(tags=["coadds"])


@router.post(
    "/views/{view_id}/coadds",
    status_code=202,
    response_model=DerivedAcceptance,
    response_model_exclude_none=True,
)
def coadd(
    view_id: UUID,
    query: CoaddRequest,
    request: Request,
    response: Response,
    repository: Repository,
    discovery: DiscoveryDependency,
    key: Annotated[UUID, Header(alias="Idempotency-Key")],
):
    return admit(view_id, query, "coadd", request, response, repository, discovery, key)


@router.get("/coadds/{identifier}")
def coadd_result(identifier: UUID, repository: Repository, response: Response):
    return result_for(identifier, "coadd", repository, response)


@router.get("/views/{view_id}/coadds/options")
def options(view_id: UUID, repository: Repository):
    report = repository.rpc("frame_set_get", {"p_id": str(view_id)})
    if not report or report.get("version") != "frames-v1":
        raise HTTPException(409, detail={"code": "prepared_view_required"})
    return {
        "detectors": [
            {
                "detector": f"D{n}",
                "input_indices": [f["index"] for f in report["frames"] if f["detector"] == f"D{n}"],
                "availability": "available"
                if any(f["detector"] == f"D{n}" for f in report["frames"])
                else "not_in_acquired_sample",
                "action": "Submit a view-v2 for this detector and same region, then pass its frame references",
            }
            for n in range(1, 7)
        ],
        "modes": ["detector_composite", "temporal_mean", "weighted_sum"],
        "epoch_window_max_seconds": 300,
        "quantitative_response_validated": False,
    }
