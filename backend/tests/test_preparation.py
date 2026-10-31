from copy import deepcopy

import numpy as np
import pytest
from astropy.io import fits
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

from app.main import app
from app.modules.bands.catalog import catalog
from app.modules.comparisons.eligibility import assess_display_pair, common_group
from app.modules.preprocessing.display import temporal_bins
from app.modules.preprocessing.pipeline import prepare
from app.modules.preprocessing.readers import NativeFrame, psf_metadata
from app.modules.registration.grid import make_grid, reproject, sample_bilinear
from app.modules.registration.residuals import measure_registration
from app.modules.targets.coordinates import RectangularRegion
from app.modules.views.schemas import PreparedViewRequest


def geometry():
    return RectangularRegion(ra=359.99, dec=20, width_arcmin=6.56, height_arcmin=6.56).geometry()


def star_image(offset=(0, 0), motion=0):
    yy, xx = np.indices((64, 64))
    data = np.full((64, 64), 10.0)
    for x, y in [
        (10, 10),
        (25, 10),
        (42, 11),
        (53, 13),
        (11, 26),
        (48, 26),
        (13, 43),
        (27, 52),
        (44, 49),
        (53, 45),
    ]:
        data += 100 * np.exp(
            -((xx - x - offset[0]) ** 2 + (yy - y - offset[1]) ** 2) / (2 * 0.9**2)
        )
    data += 300 * np.exp(-((xx - 31.5 - motion) ** 2 + (yy - 31.5) ** 2) / (2 * 0.9**2))
    return data


def projected(data):
    return {
        "science": data,
        "variance": np.ones(data.shape),
        "valid": np.ones(data.shape, dtype=bool),
        "wavelength": np.full(data.shape, 1.42),
        "bandwidth": np.full(data.shape, 0.034),
    }


def native(index=0, *, offset=(0, 0), motion=0, wavelength=1.42):
    grid, _ = make_grid(geometry())
    data = star_image(offset, motion)
    valid = np.ones(data.shape, dtype=bool)
    valid[0, 0] = False
    meta = {
        "product_id": str(index),
        "detector": "D2",
        "release": "qr3",
        "collection": "spherex_qr3",
        "calibration_version": "l2b-v27",
        "start_mjd": 60000 + index * 0.0015,
        "end_mjd": 60000 + index * 0.0015 + 0.001,
        "mid_mjd": 60000 + index * 0.0015 + 0.0005,
        "original_image_header": "preserved in raw",
        "psf": {"available": True, "header": "original"},
        "spectral": {"method": "fixture"},
    }
    return NativeFrame(
        data,
        np.ones(data.shape),
        valid,
        np.full(data.shape, wavelength),
        np.full(data.shape, 0.034),
        grid,
        meta,
    )


def test_official_nominal_catalog_and_selection_schema():
    data = catalog()
    assert len(data["channels"]) == 102
    assert [row["id"] for row in data["channels"]] == list(range(1, 103))
    assert data["channels"][0]["band_center_um"] == pytest.approx(0.752711)
    for detector in range(1, 7):
        assert len([r for r in data["channels"] if r["detector"] == f"D{detector}"]) == 17
    with TestClient(app) as client:
        assert client.get("/api/v1/bands").json()["total"] == 102
        assert "middle_pixel_response" in client.get("/api/v1/bands/31").json()
        assert client.get("/api/v1/bands/103").status_code == 404
    with pytest.raises(ValidationError):
        PreparedViewRequest(
            contract_version="view-v2",
            region={"ra": 0, "dec": 0},
            detectors=["D1"],
            preparation={"spectral_mode": "channel", "channel_id": 31},
        )


def test_bilinear_variance_uses_squared_weights_and_rejects_bad_neighbors():
    image = np.array([[1.0, 3.0], [5.0, 7.0]])
    variance = np.full((2, 2), 4.0)
    valid = np.ones((2, 2), dtype=bool)
    arrays, mask = sample_bilinear(image, variance, valid, np.array([[0.5]]), np.array([[0.5]]))
    assert arrays[0][0, 0] == 4 and arrays[1][0, 0] == 1 and mask[0, 0]
    valid[1, 1] = False
    assert not sample_bilinear(image, variance, valid, np.array([[0.5]]), np.array([[0.5]]))[
        1
    ].any()
    # A zero-weight out-of-bounds neighbor must not invalidate an exact boundary sample.
    assert sample_bilinear(
        image, variance, np.ones((2, 2), bool), np.array([[1.0]]), np.array([[0.0]])
    )[1][0, 0]


@pytest.mark.parametrize(("ra", "dec"), [(359.999, 0), (0, 90), (150, -90)])
def test_grid_exact_requested_extent_and_wrap_poles(ra, dec):
    region = RectangularRegion(ra=ra, dec=dec, width_arcmin=30, height_arcmin=20).geometry()
    grid, shape = make_grid(region)
    world = grid.pixel_to_world(-0.5, (shape[0] - 1) / 2)
    center = grid.pixel_to_world((shape[1] - 1) / 2, (shape[0] - 1) / 2)
    assert center.separation(world).arcmin == pytest.approx(15, abs=1e-6)
    assert grid.wcs.cdelt[0] < 0 < grid.wcs.cdelt[1]


def test_reprojection_preserves_surface_brightness_and_marginal_variance():
    frame = native()
    frame.science[:] = 12
    frame.valid[:] = True
    frame.variance[:] = 4
    grid, shape = make_grid(geometry())
    result = reproject(frame, grid, shape)
    assert np.allclose(result["science"][result["valid"]], 12)
    assert np.allclose(result["variance"][result["valid"]], 4, atol=1e-7)


def test_independent_static_registration_excludes_moving_target():
    reference = projected(star_image())
    current = projected(star_image((0.3, -0.2), motion=3))
    result = measure_registration(reference, current, exclusion_radius=5)
    assert result["validated"], result
    assert result["heldout_count"] >= 4
    assert result["offset_pixels"] == pytest.approx([0.3, -0.2], abs=0.12)
    blank = projected(np.ones((64, 64)))
    assert not measure_registration(blank, blank)["validated"]


def test_same_detector_does_not_override_response_or_coverage_mismatch():
    a = projected(np.ones((8, 8)))
    b = deepcopy(a)
    meta = {"detector": "D2", "release": "qr3", "calibration_version": "same"}
    b["wavelength"][:] = 1.5
    result = assess_display_pair(a, b, meta, meta)
    assert "local_wavelength_interval_mismatch" in result["reasons"]
    assert not result["quantitative_eligible"]
    b = deepcopy(a)
    b["valid"][:4] = False
    assert "insufficient_common_usable_coverage" in assess_display_pair(a, b, meta, meta)["reasons"]
    frames = [{"metadata": {"mid_mjd": i}, "valid": np.ones((1, 1), bool)} for i in range(3)]
    pairs = {
        "0:1": {"spectral_display_eligible": True},
        "1:2": {"spectral_display_eligible": True},
        "0:2": {"spectral_display_eligible": False},
    }
    assert len(common_group(frames, pairs)) == 2


def test_shared_stretch_masks_temporal_bounds_and_pipeline_outputs(tmp_path, monkeypatch):
    inputs = [native(0), native(1, offset=(0.3, -0.2), motion=3)]
    monkeypatch.setattr(
        "app.modules.preprocessing.pipeline.read_native",
        lambda path, product, region: inputs[int(path)],
    )
    products = [{"id": "a" * 64}, {"id": "b" * 64}]
    report, files = prepare(["0", "1"], products, geometry(), ["raw0", "raw1"], {}, tmp_path)
    assert report["grid"]["mode"] == "sky_fixed" and len(files) == 7
    assert report["frames"][0]["stretch"] == report["frames"][1]["stretch"]
    assert report["frames"][1]["registration"]["validated"], report["frames"][1]["registration"]
    assert len(report["temporal_bins"]) == 2
    image = np.asarray(Image.open(tmp_path / "native_0.png"))
    assert image[-1, 0, 3] == 0
    with fits.open(tmp_path / "planes_0.fits") as hdus:
        assert hdus["VARIANCE"].header["BUNIT"] == "(MJy/sr)^2"
        assert np.isnan(hdus["SCIENCE"].data[0, 0])
    inputs = [
        {"metadata": {"start_mjd": 60000, "end_mjd": 60000.001, "mid_mjd": 60000.0005}},
        {"metadata": {"start_mjd": 60001, "end_mjd": 60001.001, "mid_mjd": 60001.0005}},
    ]
    assert len(temporal_bins(inputs, [0, 1], 300)) == 2


def test_masked_native_inspection_can_be_explicitly_requested(tmp_path, monkeypatch):
    frame = native()
    frame.valid[:] = False
    monkeypatch.setattr("app.modules.preprocessing.pipeline.read_native", lambda *args: frame)
    report, _ = prepare(
        ["0"],
        [{"id": "a" * 64}],
        geometry(),
        ["raw"],
        {"native_preview_policy": "inspect_flagged"},
        tmp_path,
    )
    assert np.asarray(Image.open(tmp_path / "native_0.png"))[10, 10, 3] == 255
    assert not report["sequence_eligible"]
    assert not np.asarray(Image.open(tmp_path / "common_0.png"))[..., 3].any()


def test_release_aware_psf_readers_preserve_format_metadata():
    header = fits.Header({"CRPIX1A": -100, "CRPIX2A": -100})
    image = fits.ImageHDU(np.ones((3, 3)), header=header, name="IMAGE")
    psf = fits.ImageHDU(np.ones((1, 3, 3)), name="PSF")
    psf.header["XCTR_1"] = 101.0
    psf.header["YCTR_1"] = 101.0
    with fits.HDUList([fits.PrimaryHDU(), image, psf]) as hdus:
        assert psf_metadata(hdus, 0, 0, "qr2")["format"] == "qr2_psf_cube"
        with pytest.raises(ValueError):
            psf_metadata(hdus, 0, 0, "qr3")
    table = fits.BinTableHDU.from_columns(
        [
            fits.Column(name="XCENTER", format="D", array=[101]),
            fits.Column(name="YCENTER", format="D", array=[101]),
            fits.Column(name="NSTAR", format="J", array=[10]),
            fits.Column(name="EPSF", format="9D", dim="(3,3)", array=np.ones((1, 3, 3))),
        ],
        name="EPSF",
    )
    with fits.HDUList([fits.PrimaryHDU(), image, table]) as hdus:
        assert psf_metadata(hdus, 0, 0, "qr3")["support_stars"] == 10


def test_explicit_temporal_bin_preserves_intensity_variance_and_contributor_times(
    tmp_path, monkeypatch
):
    inputs = [native(0), native(1)]
    monkeypatch.setattr(
        "app.modules.preprocessing.pipeline.read_native", lambda path, *args: inputs[int(path)]
    )
    report, files = prepare(
        ["0", "1"],
        [{"id": "a" * 64}, {"id": "b" * 64}],
        geometry(),
        ["raw0", "raw1"],
        {"temporal_bin_seconds": 300},
        tmp_path,
    )
    assert len(report["temporal_bins"]) == 1 and report["temporal_bins"][0]["count"] == 2
    assert len(report["temporal_bins"][0]["contributor_times"]) == 2 and len(files) == 9
    with fits.open(tmp_path / "bin_0.fits") as hdus:
        assert hdus["SCIENCE"].data[20, 20] == pytest.approx(10, abs=1e-5)
        assert hdus["VARIANCE"].data[20, 20] == pytest.approx(0.5, abs=1e-6)


def test_preselection_favors_full_requested_footprint_over_more_edge_exposures():
    from app.modules.preprocessing.selection import footprint_support, preselect

    def polygon(ra, width):
        region = RectangularRegion(ra=ra, dec=20, width_arcmin=width, height_arcmin=8).geometry()
        return "POLYGON ICRS " + " ".join(
            str(v) for pair in region["corners_icrs_deg"] for v in pair
        )

    full = {
        "id": "full",
        "release": "qr3",
        "calibration_version": "same",
        "detector": "D2",
        "footprint_icrs": polygon(359.99, 8),
    }
    edge = {**full, "id": "edge", "detector": "D6", "footprint_icrs": polygon(0.08, 6.56)}
    assert footprint_support(full, geometry()) == 1
    assert footprint_support(edge, geometry()) < 1
    selected, metadata = preselect(
        [edge, {**edge, "id": "edge2"}, {**edge, "id": "edge3"}, full], geometry()
    )
    assert [p["id"] for p in selected] == ["full"] and metadata["full_footprint_candidates"] == 1
