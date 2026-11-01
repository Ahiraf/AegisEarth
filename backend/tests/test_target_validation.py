"""Numerical/failure controls for target diagnostics, independent of archive availability."""

import numpy as np
import pytest

from app.modules.targets.catalog import load_targets
from app.modules.targets.validation import aperture_diagnostic, compare_targets


def field():
    yy, xx = np.indices((31, 31))
    return (
        2 + 50 * np.exp(-((xx - 15.0) ** 2 + (yy - 15.0) ** 2) / 2),
        np.ones((31, 31)),
        np.ones((31, 31), dtype=bool),
    )


def test_flux_scaling_preserved_and_no_automatic_scientific_detection():
    image, var, mask = field()
    first = aperture_diagnostic(image, var, mask, 15, 15)
    second = aperture_diagnostic(2 * image, 4 * var, mask, 15, 15)
    assert second["contrast_sum_mjy_sr_pixels"] == pytest.approx(
        2 * first["contrast_sum_mjy_sr_pixels"]
    )
    assert second["diagonal_error_proxy"] == pytest.approx(2 * first["diagonal_error_proxy"])
    assert first["contrast_snr_proxy"] == pytest.approx(second["contrast_snr_proxy"])
    assert first["centroid_pixel_0based"] == pytest.approx([15, 15])
    assert not first["scientific_detection_validated"]


def test_masked_saturated_aperture_does_not_become_zero_flux_or_detection():
    image, var, mask = field()
    mask[15, 15] = False
    result = aperture_diagnostic(image, var, mask, 15, 15)
    assert result["contrast_sum_mjy_sr_pixels"] is None and result["centroid_pixel_0based"] is None
    assert 0 < result["usable_fraction"] < 1


def test_no_signal_and_truncated_apertures_are_explicit():
    image, var, mask = field()
    empty = aperture_diagnostic(np.full_like(image, 2), var, mask, 15, 15)
    assert empty["contrast_snr_proxy"] == 0 and empty["centroid_pixel_0based"] is None
    edge = aperture_diagnostic(image, var, mask, 0, 0)
    assert edge["edge_truncated"] and edge["contrast_snr_proxy"] is None


def test_expected_motion_is_not_measured_motion_and_exclusion_is_checked():
    target = load_targets()[0]
    diagnostics = [
        {
            "mid_mjd_utc": str(mjd),
            "pixel_scale_arcsec": 6.2,
            "header_psf_fwhm_arcsec_unvalidated": 7.5,
            "candidate_centroid_icrs_deg_unvalidated": None,
            "predicted_offset_from_fixed_center_arcsec": distance,
        }
        for mjd, distance in [(60000.0, 0), (60365.25, 100)]
    ]
    frames = [{"registration": {"validated": False}}, {"registration": {"validated": False}}]
    result = compare_targets(target, diagnostics, frames, {}, 60)[0]
    assert result["expected_tangent_motion_arcsec"] == pytest.approx(
        np.hypot(-801.551, 10362.394) / 1000
    )
    assert result["scientific_measured_displacement_arcsec"] is None
    assert not result["registration_target_exclusion_contains_predictions"]
    assert result["registration_residual_proxy_arcsec"] is None
    assert result["scientific_claim_blockers"]


def test_wise_unknown_supplied_epoch_and_system_b_identity_preserved():
    targets = {t.slug: t for t in load_targets()}
    assert targets["wise-0855"].supplied_coordinate["reference_epoch"] is None
    assert targets["epsilon-indi-b"].canonical_id == "* eps Ind B"
