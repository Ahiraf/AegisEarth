from typing import Literal

from pydantic import Field, model_validator

from app.core.schemas import StrictRequest


class PreparationOptions(StrictRequest):
    spectral_mode: Literal["common_available", "detector", "channel"] = "common_available"
    detector: Literal["D1", "D2", "D3", "D4", "D5", "D6"] | None = None
    channel_id: int | None = Field(None, ge=1, le=102)
    temporal_bin_seconds: int = Field(0, ge=0, le=300)
    stretch: Literal["shared_asinh", "per_frame_asinh"] = "shared_asinh"
    native_preview_policy: Literal["masked", "inspect_flagged"] = "masked"
    target_exclusion_radius_arcsec: float = Field(30, ge=24, le=120, allow_inf_nan=False)

    @model_validator(mode="after")
    def selections(self):
        if self.spectral_mode == "channel" and (
            self.channel_id is None or self.detector is not None
        ):
            raise ValueError("Channel mode requires channel_id only")
        if self.spectral_mode == "detector" and (
            self.detector is None or self.channel_id is not None
        ):
            raise ValueError("Detector mode requires detector only")
        if self.spectral_mode == "common_available" and (
            self.detector is not None or self.channel_id is not None
        ):
            raise ValueError("Common available mode selects its supported group automatically")
        return self
