from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.modules.bands.catalog import catalog
from app.modules.views.router import Repository

router = APIRouter(tags=["preparation"])


@router.get("/views/{view_id}/preparation")
def preparation_report(view_id: UUID, repository: Repository):
    result = repository.rpc("frame_set_get", {"p_id": str(view_id)})
    if not result:
        raise HTTPException(404, detail={"code": "preparation_not_ready_or_expired"})
    return result


@router.get("/views/{view_id}/bands")
def available_bands(view_id: UUID, repository: Repository):
    result = preparation_report(view_id, repository)
    if result.get("version") != "frames-v1":
        raise HTTPException(409, detail={"code": "prepared_source_view_required"})
    return {
        "version": catalog()["version"],
        "nominal_total": 102,
        "availability_scope": "acquired_sample_only",
        "frames": [
            {
                "product_id": f["product_id"],
                "mid_mjd": f["mid_mjd"],
                "detector": f["detector"],
                "spectral": f["spectral"],
            }
            for f in result["frames"]
        ],
        "warnings": result["warnings"][:2],
    }
