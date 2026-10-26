from typing import Literal

from pydantic import Field, model_validator

from app.core.schemas import StrictRequest
from app.modules.observations.schemas import Dec, Ra


class AnalysisRequest(StrictRequest):
    observation_ids: list[str] = Field(min_length=2, max_length=6)
    mode: Literal["pair", "sequence"] = "pair"
    center_ra_deg: Ra
    center_dec_deg: Dec
    cutout_size_arcmin: float = Field(default=2, gt=0, le=5, allow_inf_nan=False)
    max_pixels: int = Field(default=256, ge=32, le=512)
    ranking_method: Literal["classical", "cnn", "siamese"] = "classical"

    @model_validator(mode="after")
    def validate_inputs(self):
        if any(not item.strip() or len(item) > 128 for item in self.observation_ids):
            raise ValueError("Observation IDs must contain 1 to 128 characters")
        if len(set(self.observation_ids)) != len(self.observation_ids):
            raise ValueError("Observation IDs must be distinct")
        if self.mode == "pair" and len(self.observation_ids) != 2:
            raise ValueError("Pair mode requires exactly two observations")
        if self.mode == "sequence" and len(self.observation_ids) < 3:
            raise ValueError("Sequence mode requires at least three observations")
        return self
