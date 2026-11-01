import copy
from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import uuid4

import numpy as np
import pytest
from astropy.io import fits
from astropy.wcs import WCS
from fastapi.testclient import TestClient

from app.main import app
from app.modules.artifacts.router import science_image
from app.modules.views.movie import build_movie, fingerprint
from app.modules.views.router import get_view_repository


def source(count=3):
    wcs = WCS(naxis=2)
    wcs.wcs.crpix = [2, 2]
    wcs.wcs.crval = [359.999, 10]
    wcs.wcs.cdelt = [-0.001, 0.001]
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    header = wcs.to_header().tostring(sep="\n")
    view = {
        "id": str(uuid4()),
        "snapshot_id": str(uuid4()),
        "created_at_utc": "2026-11-01T00:00:00Z",
        "expires_at_utc": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        "status": "succeeded",
        "canonical_request": {"registry_version": "test", "contract_version": "view-v2"},
        "artifacts": [],
    }
    report = {
        "version": "frames-v1",
        "grid": {"header": header, "shape": [3, 3]},
        "frames": [],
        "artifacts": [],
        "sequence_eligible": False,
        "selected_indices": [],
        "options": {"temporal_bin_seconds": None},
        "temporal_bins": [],
        "warnings": ["Not calibrated photometry"],
        "spectral_calibration_version": "test",
    }
    # Deliberately out of time order: the delivery contract must not trust acquisition order.
    for index, mjd in enumerate([60002.0, 60000.0, 60001.0][:count]):
        raw_id = str(uuid4())
        view["artifacts"].append(
            {
                "id": raw_id,
                "sha256": "a" * 64,
                "source_url": "https://irsa.ipac.caltech.edu/fixture",
                "storage_key": "never-public",
            }
        )
        indices = {}
        for key, media in (
            ("native_preview", "image/png"),
            ("common_preview", "image/png"),
            ("planes", "application/fits"),
        ):
            indices[key] = len(report["artifacts"])
            report["artifacts"].append(
                {"id": str(uuid4()), "content_type": media, "sha256": "b" * 64, "size_bytes": 100}
            )
        report["frames"].append(
            {
                "index": index,
                "product_id": f"source-{index}",
                "raw_artifact_id": raw_id,
                "start_mjd": mjd,
                "end_mjd": mjd + 1 / 86400,
                "mid_mjd": mjd + 0.5 / 86400,
                "collection": "spherex_qr3",
                "release": "qr3",
                "detector": "D5",
                "calibration_version": "test",
                "native_shape": [3, 3],
                "native_wcs": header,
                "quality": {"usable_fraction": 0.9},
                "psf": {},
                "registration": {"validated": False},
                "spectral": {"method": "WCS-WAVE_visualization_proxy"},
                "common_grid_usable_fraction": 0.8,
                "stretch": {"mode": "shared_asinh", "limits_mjy_sr": [0, 1]},
                "display_eligibility": {
                    "masked_common_grid": True,
                    "native_preview_policy": "masked",
                },
                "artifact_indices": indices,
            }
        )
    return view, report


class MemoryRepository:
    def __init__(self, view, report):
        self.view, self.report, self.frozen = view, report, None

    def rpc(self, name, params):
        if name == "view_get":
            return copy.deepcopy(self.view)
        if name == "frame_set_get":
            return copy.deepcopy(self.report)
        if name == "movie_lookup":
            return copy.deepcopy(self.frozen)
        if name == "movie_publish":
            assert params["p_report"] == self.report
            if self.frozen is None:
                self.frozen = {"payload": params["p_payload"], "sha256": params["p_sha256"]}
            return copy.deepcopy(self.frozen)
        raise AssertionError(name)


@pytest.fixture
def client():
    view, report = source()
    repo = MemoryRepository(view, report)
    app.dependency_overrides[get_view_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            yield client, repo, f"/api/v1/views/{view['id']}"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("count", "outcome"), [(0, "no_data"), (1, "single_epoch"), (3, "ready_for_animation")]
)
def test_readiness_chronology_and_scientific_limits(count, outcome):
    view, report = source(count)
    movie = build_movie(view, report)
    assert movie["outcome"] == outcome
    frames = movie["frames"]["common"]
    times = [float(f["time"]["mid_mjd_utc"]) for f in frames]
    assert times == sorted(times)
    assert all(f["time"]["label_utc"].endswith("Z") for f in frames)
    if count > 1:
        assert frames[1]["time"]["elapsed_seconds"] == pytest.approx(86400)
        assert frames[1]["time"]["gap_seconds"] == pytest.approx(86399, abs=1e-4)
    assert not movie["timelines"]["common"]["comparison_supported"]
    assert movie["playback"]["loop_allowed"] is (count > 1)
    assert "never-public" not in str(movie)
    assert fingerprint(movie) == fingerprint(build_movie(view, report))


def test_overlay_provider_outage_leaves_frozen_movie_usable(client, monkeypatch):
    from app.modules.overlays.provider import OverlayUnavailable
    from app.modules.targets.coordinates import RectangularRegion

    http, repo, path = client
    repo.view["canonical_request"]["region"] = RectangularRegion(ra=359.999, dec=10).geometry()
    baseline = http.get(path + "/manifest").json()

    def unavailable(*args, **kwargs):
        raise OverlayUnavailable("provider_unavailable")

    monkeypatch.setattr("app.modules.overlays.provider.ContextProvider.catalog", unavailable)
    response = http.get(path + "/overlays/catalogs?survey=gaia")
    assert response.status_code == 503 and response.json()["viewer_remains_available"]
    assert http.get(path + "/manifest").json() == baseline
    assert http.get(path + "/frames").status_code == 200


def test_frozen_share_metadata_and_admin_refresh_protection(client):
    from app.modules.targets.coordinates import RectangularRegion

    http, repo, path = client
    repo.view["canonical_request"].update(
        region=RectangularRegion(ra=359.999, dec=10).geometry(),
        max_frames=3,
        collections=["spherex_qr3"],
        detectors=[],
        preparation={},
    )
    linked = http.get(path + "/links")
    assert linked.status_code == 200
    assert linked.json()["view_id"] == repo.view["id"] and "expires_at_utc" in linked.json()
    assert http.get(linked.json()["resolve_url"]).status_code == 200
    metadata = http.get(path + "/export-metadata").json()
    assert metadata["manifest_sha256"] == linked.json()["manifest_sha256"]
    assert http.get(path + "/export-metadata?format=csv").text.count("NASA/IPAC IRSA") == 6


def test_same_epoch_and_masked_frames_are_not_motion():
    view, report = source()
    for f in report["frames"]:
        f["mid_mjd"] = 60000
    assert build_movie(view, report)["outcome"] == "single_epoch"
    for f in report["frames"]:
        f["display_eligibility"]["masked_common_grid"] = False
    movie = build_movie(view, report)
    assert movie["outcome"] == "no_data"
    assert movie["timelines"]["native"]["frame_count"] == 3  # explicit independent inspection


def test_supported_bins_preserve_contributors_and_actual_shared_stretch():
    view, report = source()
    report["sequence_eligible"] = True
    report["selected_indices"] = [0, 1, 2]
    report["options"]["temporal_bin_seconds"] = 300
    bin_ = {
        "contributors": [0, 1],
        "start_mjd": 60000.0,
        "end_mjd": 60000.001,
        "artifact_indices": {"preview": 1, "planes": 2},
        "stretch": {"mode": "shared_asinh", "limits_mjy_sr": [2.0, 9.0], "asinh_softening": 10},
    }
    report["temporal_bins"] = [bin_, {"contributors": [2]}]
    for f in report["frames"]:
        f["stretch"] = {"mode": "per_frame_asinh", "limits_mjy_sr": [0, 1]}
    movie = build_movie(view, report)
    combined = next(f for f in movie["frames"]["common"] if f["kind"] == "temporal_bin")
    assert len(combined["original_inputs"]) == 2
    assert combined["stretch"] == bin_["stretch"]
    assert combined["time"]["label_kind"] == "bin_interval_midpoint"
    assert combined["quality"]["comparison_supported"]
    assert not movie["timelines"]["native"]["comparison_supported"]
    del bin_["stretch"]
    legacy = next(
        f for f in build_movie(view, report)["frames"]["common"] if f["kind"] == "temporal_bin"
    )
    assert legacy["stretch"]["limits_mjy_sr"] is None
    assert any("not recorded" in w for w in legacy["warnings"])


def test_manifest_pagination_cache_and_mapping(client):
    http, repo, path = client
    first = http.get(path + "/manifest")
    assert first.status_code == 200
    manifest = first.json()
    assert (
        "frames" not in manifest and manifest["timelines"]["common"]["first_frame"]["ordinal"] == 0
    )
    assert (
        http.get(path + "/manifest", headers={"If-None-Match": first.headers["etag"]}).status_code
        == 304
    )
    pages = [http.get(path + f"/frames?limit=1&offset={i}").json() for i in range(3)]
    assert [p["items"][0]["ordinal"] for p in pages] == [0, 1, 2]
    assert len({p["items"][0]["id"] for p in pages}) == 3
    assert pages[-1]["next_page"] is None and pages[0]["preload"]
    sky = http.get(path + "/frames/0/coordinates?x=0&y=0").json()
    pixel = http.get(path + f"/frames/0/coordinates?ra={sky['ra_deg']}&dec={sky['dec_deg']}").json()
    assert pixel["x"] == pytest.approx(0, abs=1e-7) and pixel["y"] == pytest.approx(0, abs=1e-7)
    fits_sky = http.get(path + "/frames/0/coordinates?x=0&y=2&origin=fits").json()
    assert fits_sky["ra_deg"] == sky["ra_deg"]
    assert http.get(path + "/frames/0/coordinates?x=0&y=0&ra=1&dec=1").status_code == 422
    assert http.get(path + "/frames/0/coordinates?x=nan&y=0").status_code == 422
    assert http.get(path + "/frames/0/coordinates?x=4&y=0").status_code == 422
    assert http.get(path + "/frames?limit=13").status_code == 422
    assert repo.frozen["sha256"] == manifest["manifest_sha256"]


@pytest.mark.parametrize(
    ("state", "expected"), [("queued", 202), ("running", 202), ("failed", 409), ("canceled", 409)]
)
def test_pending_and_terminal_errors(client, state, expected):
    http, repo, path = client
    repo.view["status"] = state
    repo.view["expires_at_utc"] = None  # retention begins only after successful publication
    response = http.get(path + "/manifest")
    assert response.status_code == expected
    if expected == 202:
        assert response.headers["retry-after"] == "2"


def test_expired_manifest_not_served(client):
    http, repo, path = client
    assert http.get(path + "/manifest").status_code == 200
    repo.view["expires_at_utc"] = "2000-01-01T00:00:00Z"
    assert http.get(path + "/manifest").status_code == 410
    repo.view = None
    assert http.get(path + "/manifest").status_code == 404


def test_primary_science_fits_preserves_wcs_units_nans_and_bytes():
    _, report = source(0)
    header = fits.Header.fromstring(report["grid"]["header"], sep="\n")
    header["BUNIT"] = "MJy/sr"
    data = np.array([[1, np.nan, 3], [4, 5, 6], [7, 8, 9]], dtype="float32")
    raw = BytesIO()
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(data, header, name="SCIENCE")]).writeto(raw)
    body = science_image(BytesIO(raw.getvalue()))
    assert body == science_image(BytesIO(raw.getvalue()))
    with fits.open(BytesIO(body)) as hdus:
        assert len(hdus) == 1 and hdus[0].data.shape == (3, 3)
        np.testing.assert_equal(hdus[0].data, data)
        assert hdus[0].header["BUNIT"] == "MJy/sr"
        assert WCS(hdus[0].header).celestial.pixel_to_world_values(1, 1)[0] == pytest.approx(
            359.999
        )
