"""Versioned engineering preflight for the curated research pair, not scientific confirmation."""

import re
from dataclasses import asdict, dataclass

from astropy.time import Time

from app.modules.observations.feasibility import interval_overlap_fraction


@dataclass(frozen=True)
class FeasibilityPolicy:
    version: str = "engineering-preflight-v1"
    minimum_epoch_separation_seconds: float = 60
    minimum_usable_fraction: float = 0.9
    minimum_common_fraction: float = 0.8
    minimum_local_interval_overlap: float = 0.9
    maximum_center_shift_in_bandwidths: float = 0.1


def psf_header_is_corrected(version: str) -> bool:
    match = re.fullmatch(r"(\d+)\.(\d+)(?:\.(\d+))?(\+psffix1)?", version)
    if not match:
        return False
    base = tuple(int(part or 0) for part in match.groups()[:3])
    return base >= (6, 5, 6) or ((6, 4, 0) <= base <= (6, 5, 5) and bool(match[4]))


def assess_pair(
    left: dict, right: dict, geometry: dict, policy: FeasibilityPolicy | None = None
) -> dict:
    policy = policy or FeasibilityPolicy()
    dt = abs(
        (
            Time(left["mid_utc"].removesuffix("Z"), scale="utc")
            - Time(right["mid_utc"].removesuffix("Z"), scale="utc")
        ).sec
    )
    shift = abs(left["wavelength_um"] - right["wavelength_um"]) / min(
        left["bandwidth_um"], right["bandwidth_um"]
    )
    center_overlap = float(
        interval_overlap_fraction(
            left["wavelength_um"],
            left["bandwidth_um"],
            right["wavelength_um"],
            right["bandwidth_um"],
        )
    )
    checks = {
        "distinct_observations": left["observation_id"] != right["observation_id"],
        "known_same_time_scale": left["time_scale"] == right["time_scale"] == "UTC",
        "epoch_separation": dt >= policy.minimum_epoch_separation_seconds,
        "same_pipeline": left["pipeline_version"] == right["pipeline_version"],
        "same_collection": left["collection"] == right["collection"],
        "same_processing_family": left["processing_family"] == right["processing_family"],
        "same_detector": left["detector"] == right["detector"],
        "corrected_psf_headers": all(
            psf_header_is_corrected(x["pipeline_version"]) for x in (left, right)
        ),
        "usable_inputs": min(left["usable_fraction"], right["usable_fraction"])
        >= policy.minimum_usable_fraction,
        "known_flag_semantics": left["unknown_flag_pixels"] == right["unknown_flag_pixels"] == 0,
        "common_coverage": geometry["common_usable_fraction"] >= policy.minimum_common_fraction,
        "local_wavelength_overlap": geometry["minimum_local_interval_overlap"]
        >= policy.minimum_local_interval_overlap,
        "center_wavelength_shift": shift <= policy.maximum_center_shift_in_bandwidths,
        "psf_data_available": left["psf_plane_finite"] and right["psf_plane_finite"],
    }
    checks = {key: bool(value) for key, value in checks.items()}
    return {
        "policy": asdict(policy),
        "checks": checks,
        "blocking_reasons": [k for k, v in checks.items() if not v],
        "feasible_for_backend_development": all(checks.values()),
        "epoch_separation_seconds": float(dt),
        "center_shift_in_bandwidths": shift,
        "center_interval_overlap_proxy": center_overlap,
        "geometry": geometry,
        "scientific_motion_validation": "not_performed",
        "limitations": [
            "FWHM interval proxy is not full spectral-response equivalence",
            "Numerical WCS overlap is not an empirical registration/PSF-match validation",
            "No model, moving-source confirmation or calibrated detection probability",
        ],
    }
