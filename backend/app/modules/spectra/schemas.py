from typing import Literal

from pydantic import Field, model_validator

from app.core.schemas import StrictRequest
from app.modules.coadds.schemas import FrameInput, Inputs


class Position(StrictRequest):
    ra_deg: float = Field(ge=0, lt=360, allow_inf_nan=False)
    dec_deg: float = Field(ge=-90, le=90, allow_inf_nan=False)


class EpochPosition(FrameInput, Position):
    pass


class SpectrumRequest(Inputs):
    contract_version: Literal["spectrum-v1"] = "spectrum-v1"
    position: Position | None = None
    epoch_positions: list[EpochPosition] = Field(default_factory=list, max_length=12)
    aperture_radius_pixels: float = Field(2.5, ge=1, le=3, allow_inf_nan=False)
    background_inner_pixels: float = Field(4, ge=3.5, le=8, allow_inf_nan=False)
    background_outer_pixels: float = Field(8, ge=5, le=12, allow_inf_nan=False)

    @model_validator(mode="after")
    def positions(self):
        if bool(self.position) == bool(self.epoch_positions):
            raise ValueError(
                "Supply one fixed position or an explicit position for every input epoch"
            )
        if self.background_outer_pixels <= self.background_inner_pixels:
            raise ValueError("Background annulus must be ordered")
        if self.epoch_positions and {(p.view_id, p.index) for p in self.epoch_positions} != {
            (p.view_id, p.index) for p in self.inputs
        }:
            raise ValueError("Epoch positions must cover each input exactly once")
        if len({(p.view_id, p.index) for p in self.epoch_positions}) != len(self.epoch_positions):
            raise ValueError("Duplicate epoch positions")
        return self
