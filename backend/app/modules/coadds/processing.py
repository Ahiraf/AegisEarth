"""Bounded numerical combinations of calibrated intensity, with explicit display-only response proxies."""

import numpy as np


def combine(frames, *, mode="mean", minimum_contributors=1):
    shape = frames[0]["science"].shape
    if len(frames) > 12 or any(f["science"].shape != shape for f in frames):
        raise ValueError("Grid/input bound mismatch")
    science = np.stack([f["science"] for f in frames])
    variance = np.stack([f["variance"] for f in frames])
    valid = (
        np.stack([f["valid"] for f in frames])
        & np.isfinite(science)
        & np.isfinite(variance)
        & (variance > 0)
    )
    weights = np.divide(1, variance, out=np.zeros_like(variance), where=valid)
    total = weights.sum(axis=0)
    count = valid.sum(axis=0)
    good = (count >= minimum_contributors) & (total > 0)
    # Normalize the inverse-variance weights; weighted_sum multiplies their sum
    # by count, making its units explicitly intensity x effective input count.
    alpha = np.divide(weights, total, out=np.zeros_like(weights), where=total > 0)
    factor = count if mode == "weighted_sum" else np.ones(shape)
    result = np.sum(alpha * np.where(valid, science, 0), axis=0) * factor
    noise = np.sum(alpha**2 * np.where(valid, variance, 0), axis=0) * factor**2
    wave = np.sum(alpha * np.where(valid, np.stack([f["wavelength"] for f in frames]), 0), axis=0)
    width = np.sum(alpha * np.where(valid, np.stack([f["bandwidth"] for f in frames]), 0), axis=0)
    return {
        "science": np.where(good, result, np.nan),
        "variance": np.where(good, noise, np.nan),
        "valid": good,
        "count": count,
        "coverage": count / len(frames),
        "weights": alpha * factor[None, :, :],
        "wavelength": np.where(good, wave, np.nan),
        "bandwidth": np.where(good, width, np.nan),
        "wavelength_min": np.min(
            np.where(valid, np.stack([f["wavelength"] for f in frames]), np.inf), axis=0
        ),
        "wavelength_max": np.max(
            np.where(valid, np.stack([f["wavelength"] for f in frames]), -np.inf), axis=0
        ),
    }
