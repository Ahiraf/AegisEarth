from fastapi import APIRouter

from app.core.errors import FeatureUnavailable
from app.modules.analyses.schemas import AnalysisRequest

router = APIRouter(prefix="/analyses", tags=["analyses"])


@router.post("", responses={503: {"description": "Scientific pipeline not implemented"}})
def submit_analysis(request: AnalysisRequest):
    # Never accept work into an unimplemented queue or manufacture detections.
    raise FeatureUnavailable("Image analysis execution")
