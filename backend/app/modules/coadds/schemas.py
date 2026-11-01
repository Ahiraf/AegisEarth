from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.core.schemas import StrictRequest


class FrameInput(StrictRequest):
    view_id: UUID
    index: int = Field(ge=0, le=11)


class Inputs(StrictRequest):
    inputs: list[FrameInput] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def unique(self):
        if len({(i.view_id, i.index) for i in self.inputs}) != len(self.inputs):
            raise ValueError("Input frames must be unique")
        return self


class CoaddRequest(Inputs):
    contract_version: Literal["coadd-v1"] = "coadd-v1"
    mode: Literal["detector_composite", "temporal_mean", "weighted_sum"] = "detector_composite"
    detector: Literal["D1", "D2", "D3", "D4", "D5", "D6"]
    epoch_window_seconds: int = Field(300, ge=0, le=300)
    wavelength_min_um: float = Field(0.7, ge=0.7, le=5.5, allow_inf_nan=False)
    wavelength_max_um: float = Field(5.5, ge=0.7, le=5.5, allow_inf_nan=False)
    minimum_contributors: int = Field(1, ge=1, le=12)

    @model_validator(mode="after")
    def window(self):
        if self.wavelength_max_um <= self.wavelength_min_um:
            raise ValueError("Wavelength window must be ordered")
        return self
