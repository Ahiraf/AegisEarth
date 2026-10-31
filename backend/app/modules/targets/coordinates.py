"""Explicit coordinate units and spherical TAN-field geometry, including poles/RA wrap."""

import math
import re
from typing import Annotated

import astropy.units as u
import numpy as np
from astropy.coordinates import Angle
from pydantic import Field, model_validator

from app.core.schemas import StrictRequest


class Coordinates(StrictRequest):
    ra: Annotated[float, Field(strict=True)] | str
    dec: Annotated[float, Field(strict=True)] | str
    ra_unit: str | None = None
    dec_unit: str = "deg"
    frame: str = "icrs"

    @model_validator(mode="after")
    def valid(self):
        self.normalized()
        return self

    def normalized(self):
        if self.frame != "icrs" or self.dec_unit != "deg":
            raise ValueError("Only ICRS and declination degrees are accepted")
        if isinstance(self.ra, str) and (
            "d" in self.ra.lower()
            or (len(self.ra.split()) > 1 and not any(c in self.ra.lower() for c in ":hms"))
        ):
            raise ValueError("Use decimal RA degrees or hourangle sexagesimal notation")
        if isinstance(self.dec, str) and "h" in self.dec.lower():
            raise ValueError("Declination must use degrees")
        sexa = isinstance(self.ra, str) and any(c in self.ra.lower() for c in ":hms")
        unit = self.ra_unit or ("hourangle" if sexa else "deg")
        if unit not in {"deg", "hourangle"} or (sexa and unit != "hourangle"):
            raise ValueError("Sexagesimal RA requires hourangle; decimal RA defaults to degrees")
        for value in (self.ra, self.dec):
            if isinstance(value, str) and (
                len(value) > 64 or not re.fullmatch(r"[0-9+.:\- dhmsDHMS]+", value)
            ):
                raise ValueError("Use decimal or explicit sexagesimal coordinates")
        try:
            ra = float(Angle(self.ra, unit=u.hourangle if unit == "hourangle" else u.deg).degree)
            dec = float(Angle(self.dec, unit=u.deg).degree)
        except (ValueError, TypeError, u.UnitsError) as exc:
            raise ValueError("Invalid coordinates") from exc
        if not math.isfinite(ra) or not math.isfinite(dec) or abs(ra) > 1e6 or abs(dec) > 90:
            raise ValueError("Coordinates must be finite; declination must be within ±90 degrees")
        return {"ra_deg": ra % 360, "dec_deg": dec, "frame": "icrs"}


class RectangularRegion(Coordinates):
    width_arcmin: float = Field(default=5, ge=1, le=30, allow_inf_nan=False)
    height_arcmin: float = Field(default=5, ge=1, le=30, allow_inf_nan=False)

    def geometry(self):
        center = self.normalized()
        ra, dec = np.deg2rad([center["ra_deg"], center["dec_deg"]])
        origin = np.array([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)])
        east = np.array([-np.sin(ra), np.cos(ra), 0])
        north = np.cross(origin, east)
        x, y = np.tan(np.deg2rad([self.width_arcmin / 120, self.height_arcmin / 120]))
        corners = []
        for dx, dy in ((-x, -y), (x, -y), (x, y), (-x, y)):
            vector = origin + dx * east + dy * north
            vector /= np.linalg.norm(vector)
            corners.append(
                [
                    float(np.rad2deg(np.arctan2(vector[1], vector[0])) % 360),
                    float(np.rad2deg(np.arcsin(np.clip(vector[2], -1, 1)))),
                ]
            )
        return {
            **center,
            "width_arcmin": self.width_arcmin,
            "height_arcmin": self.height_arcmin,
            "projection": "TAN_north_up_east_left",
            "corners_icrs_deg": corners,
            "search_radius_deg": float(np.rad2deg(np.arctan(np.hypot(x, y)))) + 1e-9,
        }
