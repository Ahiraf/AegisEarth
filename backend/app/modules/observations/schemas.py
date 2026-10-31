from datetime import timedelta
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.core.schemas import StrictRequest
from app.modules.targets.coordinates import RectangularRegion

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


class DiscoveryCriteria(StrictRequest):
    region: RectangularRegion
    start_at: AwareDatetime | None = None
    end_at: AwareDatetime | None = None
    collections: list[
        Literal["spherex_qr3", "spherex_qr3_deep", "spherex_qr2", "spherex_qr2_deep"]
    ] = Field(
        default_factory=lambda: [
            "spherex_qr3",
            "spherex_qr3_deep",
            "spherex_qr2",
            "spherex_qr2_deep",
        ],
        min_length=1,
        max_length=4,
    )
    detectors: list[Literal["D1", "D2", "D3", "D4", "D5", "D6"]] = Field(
        default_factory=list, max_length=6
    )
    wavelength_min_um: float | None = Field(default=None, ge=0.7, le=5.5, allow_inf_nan=False)
    wavelength_max_um: float | None = Field(default=None, ge=0.7, le=5.5, allow_inf_nan=False)

    @model_validator(mode="after")
    def bounds(self):
        if (self.start_at is None) != (self.end_at is None):
            raise ValueError("Supply both dates or omit both to discover available dates")
        if self.start_at and (
            self.end_at <= self.start_at or self.end_at - self.start_at > timedelta(days=730)
        ):
            raise ValueError("Date window must be ordered and at most 730 days")
        if (self.wavelength_min_um is None) != (self.wavelength_max_um is None):
            raise ValueError("Supply both wavelength bounds or neither")
        if self.wavelength_min_um is not None and self.wavelength_max_um < self.wavelength_min_um:
            raise ValueError("Wavelength interval must be ordered")
        if len(set(self.collections)) != len(self.collections) or len(set(self.detectors)) != len(
            self.detectors
        ):
            raise ValueError("Selections must be unique")
        return self


class DiscoverySearch(DiscoveryCriteria):
    contract_version: Literal["discovery-v1"]
    limit: int = Field(default=20, ge=1, le=100)


class DiscoveryPage(BaseModel):
    contract_version: Literal["discovery-v1"] = "discovery-v1"
    snapshot_id: str
    registry_version: str
    canonical_query: dict
    created_at_utc: AwareDatetime
    revalidate_after_utc: AwareDatetime
    cache_hit: bool
    stale: bool
    upstream_complete: bool
    total: int | None
    sampled_count: int
    offset: int
    limit: int
    items: list[dict]
    next_page: str | None
    availability: dict
    sources: list[dict]
    warnings: list[str]
