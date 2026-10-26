from datetime import timedelta
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.core.schemas import StrictRequest

Ra = Annotated[float, Field(ge=0, lt=360, allow_inf_nan=False)]
Dec = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]


class SkyRegion(StrictRequest):
    ra_deg: Ra
    dec_deg: Dec
    radius_deg: float = Field(gt=0, le=0.1, allow_inf_nan=False)


class ObservationSearch(StrictRequest):
    region: SkyRegion
    start_at: AwareDatetime
    end_at: AwareDatetime
    collection: Literal["spherex_qr3", "spherex_qr2"] = "spherex_qr3"
    limit: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def validate_window(self):
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be later than start_at")
        if self.end_at - self.start_at > timedelta(days=730):
            raise ValueError("Search window must be at most 730 days")
        return self


class ObservationSummary(BaseModel):
    id: str
    provider_id: str
    collection: str
    release: str
    observed_at_utc: AwareDatetime | None
    time_scale: str | None
    ra_deg: Ra
    dec_deg: Dec
    detector: str | None
