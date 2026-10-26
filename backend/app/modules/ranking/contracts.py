from typing import Literal, Protocol

from pydantic import BaseModel, Field, model_validator


class RankingResult(BaseModel):
    score: float = Field(ge=0, le=1, allow_inf_nan=False)
    score_kind: Literal["candidate_score", "calibrated_probability"] = "candidate_score"
    model_version_id: str
    calibration_reference: str | None = None
    explanation_codes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_calibration(self):
        if self.score_kind == "calibrated_probability" and not self.calibration_reference:
            raise ValueError("Probability output requires validation/calibration evidence")
        return self


class CandidateRanker(Protocol):
    """One interface for a classical baseline or a separately validated trained model."""

    def rank(self, evidence: dict) -> RankingResult: ...
