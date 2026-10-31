from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.modules.targets.catalog import Target, load_targets
from app.modules.targets.coordinates import Coordinates

router = APIRouter(prefix="/targets", tags=["targets"])


@router.post("/resolve")
def resolve_coordinates(coordinates: Coordinates):
    return {"contract_version": "coordinates-v1", **coordinates.normalized()}


class TargetCatalog(BaseModel):
    catalog_version: str
    status: Literal["curated_research_snapshot_not_live_discovery"]
    items: list[Target]
    total: int


@router.get("", response_model=TargetCatalog)
def targets():
    return {
        "catalog_version": "2026-10-29",
        "status": "curated_research_snapshot_not_live_discovery",
        "items": [target.model_dump() for target in load_targets()],
        "total": 5,
    }
