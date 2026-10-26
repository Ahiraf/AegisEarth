from fastapi import APIRouter

from app.core.errors import FeatureUnavailable
from app.modules.observations.schemas import ObservationSearch

router = APIRouter(prefix="/observations", tags=["observations"])


@router.post("/search", responses={503: {"description": "Discovery adapter not implemented"}})
def search_observations(query: ObservationSearch):
    raise FeatureUnavailable("SPHEREx observation discovery")
