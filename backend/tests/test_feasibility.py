"""Scientific-input failure cases for the offline milestone-one inspector."""

import json
from copy import deepcopy
from pathlib import Path

import numpy as np
import pytest
from astropy.io import fits
from astropy.io.votable import parse_single_table

from app.modules.comparisons.feasibility import assess_pair, psf_header_is_corrected
from app.modules.observations.feasibility import interval_overlap_fraction, valid_pixels


def flag_hdus():
    header = fits.Header({"HIERARCH MP_SOURCE": 21, "HIERARCH MP_FULLSAMPLE": 12, "MP_HALO": 28})
    flags = np.array([[1 << 21, (1 << 21) | (1 << 12), 1 << 28, 1 << 3]], dtype=np.uint32)
    return fits.HDUList(
        [
            fits.PrimaryHDU(),
            fits.ImageHDU(np.ones((1, 4)), name="IMAGE"),
            fits.ImageHDU(np.ones((1, 4)), name="VARIANCE"),
            fits.ImageHDU(flags, header=header, name="FLAGS"),
        ]
    )


def test_information_flags_kept_and_artifact_and_unknown_bits_masked():
    with flag_hdus() as hdus:
        mask, _, unknown = valid_pixels(hdus)
    assert mask.tolist() == [[True, True, False, False]]
    assert unknown == 1


def test_nonfinite_science_and_nonpositive_variance_are_not_usable():
    with flag_hdus() as hdus:
        hdus["IMAGE"].data[0, 0] = np.nan
        hdus["VARIANCE"].data[0, 1] = 0
        assert not valid_pixels(hdus)[0].any()


def test_unknown_flag_semantics_fail_closed():
    with flag_hdus() as hdus:
        del hdus["FLAGS"].header["MP_SOURCE"]
        with pytest.raises(ValueError, match="semantics"):
            valid_pixels(hdus)


@pytest.mark.parametrize("width", [0, -1, float("nan"), float("inf")])
def test_bad_bandwidth_is_rejected(width):
    with pytest.raises(ValueError):
        interval_overlap_fraction(1.4, width, 1.4, 0.03)


def test_interval_proxy_uses_local_wavelength_not_detector_label():
    assert interval_overlap_fraction(1.42, 0.034, 1.4204, 0.034) > 0.98
    assert interval_overlap_fraction(1.42, 0.034, 1.454, 0.035) < 0.03
    assert interval_overlap_fraction(1.42, 0.034, 1.6, 0.034) == 0


@pytest.mark.parametrize(
    ("version", "corrected"),
    [
        ("6.4", False),
        ("6.4+psffix1", True),
        ("6.5.5", False),
        ("6.5.5+psffix1", True),
        ("6.5.6", True),
        ("6.5.7", True),
        ("unknown", False),
    ],
)
def test_psf_correction_rule(version, corrected):
    assert psf_header_is_corrected(version) is corrected


def pair_inputs():
    left = {
        "observation_id": "a",
        "mid_utc": "2026-05-17T10:54:42.815Z",
        "time_scale": "UTC",
        "wavelength_um": 1.42,
        "bandwidth_um": 0.034,
        "pipeline_version": "6.5.7",
        "collection": "spherex_qr2",
        "processing_family": "l2b-v25",
        "detector": 2,
        "usable_fraction": 0.99,
        "unknown_flag_pixels": 0,
        "psf_plane_finite": True,
    }
    right = {
        **left,
        "observation_id": "b",
        "mid_utc": "2026-06-22T20:22:30.749Z",
        "wavelength_um": 1.4204,
    }
    geometry = {"common_usable_fraction": 0.88, "minimum_local_interval_overlap": 0.98}
    return left, right, geometry


def test_comparison_reports_evidence_without_claiming_motion():
    report = assess_pair(*pair_inputs())
    assert report["feasible_for_backend_development"]
    assert report["scientific_motion_validation"] == "not_performed"
    json.dumps(report, allow_nan=False)


@pytest.mark.parametrize(
    ("field", "value", "reason"),
    [
        ("observation_id", "a", "distinct_observations"),
        ("mid_utc", "2026-05-17T10:54:42.815Z", "epoch_separation"),
        ("collection", "spherex_qr3", "same_collection"),
        ("wavelength_um", 1.454, "center_wavelength_shift"),
        ("unknown_flag_pixels", 1, "known_flag_semantics"),
        ("psf_plane_finite", False, "psf_data_available"),
    ],
)
def test_incompatible_metadata_fails_with_reason(field, value, reason):
    left, right, geometry = deepcopy(pair_inputs())
    right[field] = value
    report = assess_pair(left, right, geometry)
    assert not report["feasible_for_backend_development"]
    assert reason in report["blocking_reasons"]


def test_real_metadata_contract_and_empty_result_fixture():
    directory = Path(__file__).parent / "fixtures/observations"
    qr2 = parse_single_table(directory / "m101_qr2.xml").to_table(use_names_over_ids=True)
    qr3 = parse_single_table(directory / "m101_qr3.xml").to_table(use_names_over_ids=True)
    assert len(qr2) == 150 and len(qr3) == 0
    assert {"obs_id", "access_url", "s_region", "t_min", "t_max"} <= set(qr2.colnames)
    assert "2026W26_1A_0178_1" in qr2["obs_id"]
