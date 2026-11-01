from uuid import uuid4

import numpy as np
import pytest
from astropy.wcs import WCS
from pydantic import ValidationError
from scipy.special import erf

from app.modules.coadds.processing import combine
from app.modules.coadds.schemas import CoaddRequest
from app.modules.differencing.processing import difference_gate, subtract
from app.modules.spectra.photometry import aperture_flux, solid_angles
from app.modules.spectra.schemas import SpectrumRequest


def frame(value, variance=1):
    return {
        "science": np.full((31, 31), value, dtype=float),
        "variance": np.full((31, 31), variance, dtype=float),
        "valid": np.ones((31, 31), dtype=bool),
        "wavelength": np.full((31, 31), 2.0),
        "bandwidth": np.full((31, 31), 0.05),
    }


@pytest.mark.parametrize("detector", [f"D{i}" for i in range(1, 7)])
def test_all_six_detector_contracts_and_noise_weighting(detector):
    query = CoaddRequest(inputs=[{"view_id": str(uuid4()), "index": 0}], detector=detector)
    assert query.detector == detector
    result = combine([frame(2, 1), frame(10, 4)])
    assert result["science"][15, 15] == pytest.approx(3.6)
    assert result["variance"][15, 15] == pytest.approx(0.8)
    assert result["weights"][:, 15, 15] == pytest.approx([0.8, 0.2])
    assert result["count"][15, 15] == 2
    weighted_sum = combine([frame(2, 1), frame(10, 4)], mode="weighted_sum")
    assert weighted_sum["science"][15, 15] == pytest.approx(7.2)
    assert weighted_sum["variance"][15, 15] == pytest.approx(3.2)


def test_masks_are_not_zero_measurements_and_required_contributors_are_enforced():
    first, second = frame(4), frame(99)
    second["valid"][15, 15] = False
    result = combine([first, second])
    assert result["science"][15, 15] == 4 and result["coverage"][15, 15] == 0.5
    assert not combine([first, second], minimum_contributors=2)["valid"][15, 15]
    second["variance"][0, 0] = np.nan
    assert combine([first, second])["science"][0, 0] == 4


def test_signed_difference_static_variable_shift_and_variance():
    first, later = frame(5, 2), frame(5, 3)
    result = subtract(first, later)
    assert np.all(result["science"] == 0) and np.all(result["variance"] == 5)
    later["science"][15, 15] += 7
    result = subtract(first, later)
    assert result["science"][15, 15] == 7
    first["science"][12, 12] = 20
    later["science"][12, 13] = 20
    result = subtract(first, later)
    assert result["science"][12, 12] < 0 and result["science"][12, 13] > 0
    later["valid"][12, 13] = False
    assert np.isnan(subtract(first, later)["science"][12, 13])


def test_response_registration_and_psf_gates_cannot_be_bypassed():
    pair = {"spectral_display_eligible": True, "quantitative_eligible": True, "reasons": []}
    evidence = {"registration": {"validated": True}, "psf": {"applied_psf_matching": True}}
    assert difference_gate(pair, evidence, evidence)["eligible"]
    assert not difference_gate(pair, {}, evidence)["eligible"]
    assert not difference_gate(pair | {"quantitative_eligible": False}, evidence, evidence)[
        "eligible"
    ]
    assert not difference_gate(pair | {"spectral_display_eligible": False}, evidence, evidence)[
        "eligible"
    ]


def grid():
    w = WCS(naxis=2)
    w.wcs.crpix = [16, 16]
    w.wcs.crval = [359.999, 10]
    w.wcs.cdelt = [-6.15 / 3600, 6.15 / 3600]
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    return w


def test_solid_angle_matches_small_pixel_geometry_and_ra_wrap():
    omega = solid_angles(grid(), (31, 31))
    expected = (np.deg2rad(6.15 / 3600)) ** 2
    assert omega[15, 15] == pytest.approx(expected, rel=1e-5)
    assert np.isfinite(omega).all() and (omega > 0).all()


def test_photometry_recovers_independent_pixel_integrated_gaussian_flux_and_units():
    sigma = 0.6
    yy, xx = np.indices((31, 31))
    factor = 10
    axis = np.arange(101) - 50
    py, px = np.meshgrid(axis / factor, axis / factor, indexing="ij")
    psf = np.exp(-(px**2 + py**2) / (2 * sigma**2))

    # Analytic Gaussian integrated over detector pixels is independent of PSF projection implementation.
    def interval(a):
        return 0.5 * (erf((a + 0.5) / (np.sqrt(2) * sigma)) - erf((a - 0.5) / (np.sqrt(2) * sigma)))

    model = interval(xx - 15) * interval(yy - 15)
    omega = solid_angles(grid(), (31, 31))
    source = 1200.0
    science = source * model / (omega * 1e12) + 3
    result = aperture_flux(
        science,
        np.full((31, 31), 0.01),
        np.ones((31, 31), bool),
        np.ones((31, 31), bool),
        grid(),
        15,
        15,
        psf,
        factor,
        2.5,
        4,
        8,
    )
    assert result["flux_uJy"] == pytest.approx(source, rel=0.015)
    assert result["flux_error_uJy"] > 0 and result["status"] == "diagnostic_only"
    assert result["upper_limit_uJy"] is None
    science[15, 15] = np.nan
    valid = np.isfinite(science)
    blocked = aperture_flux(
        science, np.ones((31, 31)), valid, valid, grid(), 15, 15, psf, factor, 2.5, 4, 8
    )
    assert blocked["flux_uJy"] is None


def test_spectrum_explicit_epoch_positions_and_strict_schema():
    ref = {"view_id": str(uuid4()), "index": 0}
    with pytest.raises(ValidationError):
        SpectrumRequest(inputs=[ref])
    with pytest.raises(ValidationError):
        SpectrumRequest(inputs=[ref], position={"ra_deg": 0, "dec_deg": 0}, approve_science=True)
    request = SpectrumRequest(
        inputs=[ref], epoch_positions=[ref | {"ra_deg": 359.999, "dec_deg": -7}]
    )
    assert request.position is None
    with pytest.raises(ValidationError):
        SpectrumRequest(
            inputs=[ref], epoch_positions=[ref | {"index": 1, "ra_deg": 0, "dec_deg": 0}]
        )


def test_epoch_composites_keep_shared_stretch_and_contributor_exposure(tmp_path):
    from app.modules.analyses.derived_executor import coadds

    artifacts = []

    def artifact(path, kind, ids):
        artifacts.append((path, kind, ids))
        return len(artifacts) - 1

    frames = [frame(2), frame(8)]
    sources = [
        {
            "metadata": {
                "detector": "D2",
                "start_mjd": 60000 + i,
                "end_mjd": 60000 + i + 100 / 86400,
                "product_id": str(i),
            }
        }
        for i in range(2)
    ]
    query = CoaddRequest(inputs=[{"view_id": str(uuid4()), "index": 0}], detector="D2").model_dump()
    result = coadds(
        frames,
        sources,
        query,
        {"header": grid().to_header().tostring(sep="\n")},
        tmp_path,
        artifact,
    )
    assert result["groups"][0]["stretch"] == result["groups"][1]["stretch"]
    from astropy.io import fits

    with fits.open(tmp_path / "result_0.fits") as hdus:
        assert "WEIGHTS" in hdus and "EXPOSURE" in hdus and "CONTRIBUTORS" in hdus
        assert hdus["EXPOSURE"].data[15, 15] == pytest.approx(100, rel=1e-5)
