import itertools

import numpy as np

from app.modules.observations.feasibility import interval_overlap_fraction


def assess_display_pair(a, b, meta_a, meta_b):
    common = a["valid"] & b["valid"]
    overlap = (
        interval_overlap_fraction(
            a["wavelength"][common],
            a["bandwidth"][common],
            b["wavelength"][common],
            b["bandwidth"][common],
        )
        if common.any()
        else np.array([])
    )
    reasons = []
    if meta_a["detector"] != meta_b["detector"]:
        reasons.append("different_detectors")
    if (
        meta_a["release"] != meta_b["release"]
        or meta_a["calibration_version"] != meta_b["calibration_version"]
    ):
        reasons.append("different_calibration")
    if common.mean() < 0.8:
        reasons.append("insufficient_common_usable_coverage")
    if not overlap.size or np.min(overlap) < 0.9:
        reasons.append("local_wavelength_interval_mismatch")
    return {
        "spectral_display_eligible": not reasons,
        "reasons": reasons,
        "common_usable_fraction": float(common.mean()),
        "minimum_interval_overlap_proxy": float(np.min(overlap)) if overlap.size else None,
        "response_method": "WCS-WAVE_FWHM_interval_proxy_not_full_response_equivalence",
        "quantitative_eligible": False,
        "quantitative_blocking_reasons": [
            "pipeline_CWAVE_CBAND_not_applied",
            "PSF_matching_not_performed",
            "photometric_background_calibration_not_validated",
            "resampling_covariance_not_propagated",
        ],
    }


def common_group(frames, pairs):
    # <=12 inputs: exhaustive complete-link search avoids chaining incompatible endpoints.
    indices = range(len(frames))
    for count in range(len(frames), 0, -1):
        groups = [
            list(group)
            for group in itertools.combinations(indices, count)
            if all(
                pairs[f"{i}:{j}"]["spectral_display_eligible"]
                for i, j in itertools.combinations(group, 2)
            )
        ]
        if groups:
            return max(
                groups,
                key=lambda g: (
                    len({frames[i]["metadata"]["mid_mjd"] for i in g}),
                    sum(float(frames[i]["valid"].mean()) for i in g),
                    tuple(-i for i in g),
                ),
            )
    return []
