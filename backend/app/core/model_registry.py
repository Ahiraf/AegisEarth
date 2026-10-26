"""Import every feature's model for Alembic and test metadata discovery."""

from app.modules.analyses.models import AnalysisInput, AnalysisRun, StageExecution
from app.modules.artifacts.models import Artifact
from app.modules.candidates.models import Candidate
from app.modules.observations.models import Observation
from app.modules.ranking.models import ModelVersion

__all__ = [
    "AnalysisInput",
    "AnalysisRun",
    "Artifact",
    "Candidate",
    "ModelVersion",
    "Observation",
    "StageExecution",
]
