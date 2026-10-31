"""Import every feature's model for Alembic and test metadata discovery."""

from app.modules.analyses.jobs import ProcessingJob
from app.modules.analyses.models import AnalysisInput, AnalysisRun, StageExecution
from app.modules.artifacts.models import Artifact
from app.modules.candidates.models import Candidate
from app.modules.observations.discovery_models import DiscoverySnapshot, SourceProduct
from app.modules.observations.models import Observation
from app.modules.preprocessing.models import PreparedArtifact, PreparedFrameSet
from app.modules.ranking.models import ModelVersion
from app.modules.views.models import SkyView, ViewFile, ViewInputPin, ViewSubmission

__all__ = [
    "AnalysisInput",
    "AnalysisRun",
    "Artifact",
    "Candidate",
    "DiscoverySnapshot",
    "ModelVersion",
    "Observation",
    "PreparedArtifact",
    "PreparedFrameSet",
    "ProcessingJob",
    "SkyView",
    "SourceProduct",
    "StageExecution",
    "ViewFile",
    "ViewInputPin",
    "ViewSubmission",
]
