"""Signed subtraction is numerical only after operation-specific evidence is satisfied."""

import numpy as np


def difference_gate(pair, left, right):
    reasons = list(pair.get("reasons", []))
    if not pair.get("spectral_display_eligible"):
        reasons.append("spectral_display_support_missing")
    if not pair.get("quantitative_eligible"):
        reasons.extend(
            pair.get("quantitative_blocking_reasons", ["quantitative_calibration_unverified"])
        )
    if not (
        left.get("registration", {}).get("validated")
        or right.get("registration", {}).get("validated")
    ):
        reasons.append("independent_registration_not_validated")
    if not (
        left.get("psf", {}).get("applied_psf_matching")
        and right.get("psf", {}).get("applied_psf_matching")
    ):
        reasons.append("PSF_matching_not_validated")
    return {"eligible": not reasons, "reasons": list(dict.fromkeys(reasons))}


def subtract(earlier, later):
    if earlier["science"].shape != later["science"].shape:
        raise ValueError("Grid mismatch")
    valid = earlier["valid"] & later["valid"]
    science = later["science"] - earlier["science"]
    variance = later["variance"] + earlier["variance"]
    valid &= np.isfinite(science) & np.isfinite(variance) & (variance > 0)
    return {
        "science": np.where(valid, science, np.nan),
        "variance": np.where(valid, variance, np.nan),
        "valid": valid,
        "wavelength": earlier["wavelength"],
        "bandwidth": earlier["bandwidth"],
    }
