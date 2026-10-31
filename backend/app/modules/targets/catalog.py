"""Verified target catalog and approximate search positions, not measured detections."""

import json
from pathlib import Path

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time
from pydantic import BaseModel, ConfigDict, Field


class Target(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    slug: str
    name: str
    canonical_id: str
    ra_deg: float = Field(ge=0, lt=360)
    dec_deg: float = Field(ge=-90, le=90)
    reference_epoch_jyear: float
    pm_ra_cosdec_mas_yr: float | None
    pm_dec_mas_yr: float | None
    astrometry: dict
    source_receipt: str
    supplied_coordinate: dict | None = None
    caveats: list[str]

    def search_position(self, at_utc: str) -> dict:
        coordinate = SkyCoord(self.ra_deg, self.dec_deg, unit="deg", frame="icrs")
        if self.pm_ra_cosdec_mas_yr is None or self.pm_dec_mas_yr is None:
            return {
                "ra_deg": self.ra_deg,
                "dec_deg": self.dec_deg,
                "model": "catalog_position_only",
            }
        years = Time(at_utc, scale="utc").jyear - self.reference_epoch_jyear
        moved = coordinate.spherical_offsets_by(
            self.pm_ra_cosdec_mas_yr * years * u.mas, self.pm_dec_mas_yr * years * u.mas
        )
        return {
            "ra_deg": float(moved.ra.deg),
            "dec_deg": float(moved.dec.deg),
            "model": "approximate_tangent_motion_no_parallax_or_radial_velocity",
            "at_utc": at_utc,
        }


def load_targets() -> list[Target]:
    data = json.loads(Path(__file__).with_name("catalog.json").read_text(encoding="utf-8"))
    targets = [Target.model_validate(item) for item in data["targets"]]
    if len(targets) != 5 or len({target.slug for target in targets}) != 5:
        raise ValueError("Expected five unique challenge targets")
    return targets
