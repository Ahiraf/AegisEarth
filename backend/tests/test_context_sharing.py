import io
import json
from uuid import uuid4

import httpx
import numpy as np
import pytest
from astropy.io import fits
from astropy.wcs import WCS
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings
from app.main import app
from app.modules.artifacts.export_pipeline import export_movie
from app.modules.overlays.provider import ContextProvider, OverlayUnavailable
from app.modules.overlays.service import image_layer, locate, marker
from app.modules.views.schemas import PreparedViewRequest
from app.modules.views.sharing import ShareState, decode, encode, normalize


def spatial(ra=359.999, dec=60):
    w = WCS(naxis=2)
    w.wcs.crpix = [16, 16]
    w.wcs.crval = [ra, dec]
    w.wcs.cdelt = [-1 / 3600, 1 / 3600]
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    return {"shape": [31, 31], "wcs_header": w.to_header().tostring(sep="\n")}


def test_prediction_pmra_cosdec_wrap_and_exact_ids():
    row = {
        "source_id": "4472831207517410816",
        "ra": "359.999",
        "dec": "60",
        "ref_epoch": "2016",
        "pmra": "1000",
        "pmdec": "0",
    }
    result = marker(row, "gaia", spatial(), "2026-01-01T00:00:00Z", True)
    assert result["id"] == row["source_id"] and not result["spherex_detection"]
    # 10 years * 1000 mas/yr / cos(60deg) = 20 arcseconds RA, crossing 360.
    assert result["display_position"]["ra_deg"] == pytest.approx(
        (359.999 + 20 / 3600) % 360, abs=2e-6
    )
    assert result["position_status"].startswith("linear_proper_motion")
    missing = marker({**row, "pmra": ""}, "gaia", spatial(), "2026-01-01T00:00:00Z", True)
    assert missing["display_position"] == missing["catalog_position"]
    assert missing["position_status"] == "unpropagated_missing_astrometry"


def test_common_pixel_and_png_orientation():
    p = locate(359.999, 60, spatial())
    assert p["x_png"] == pytest.approx(15) and p["y_png"] == pytest.approx(15)
    p = locate(359.999, 60 + 2 / 3600, spatial())
    assert p["y_png"] == pytest.approx(13, abs=1e-5) and p["inside"]


def test_wise_cutout_requests_uncompressed_bounded_fits():
    requests = []

    def handler(request):
        requests.append(request)
        if "/search/" in request.url.path:
            return httpx.Response(200, content=b"band,coadd_id\n1,1330m075_ac51\n")
        assert request.url.params["gzip"] == "false"
        assert request.url.params["size"].endswith("arcmin")
        return httpx.Response(200, content=b"SIMPLE  =" + b" " * 71)

    provider = ContextProvider(Settings(_env_file=None), transport=httpx.MockTransport(handler))
    data, _, url = provider.wise_image(133, -7, 1, 5)
    assert data.startswith(b"SIMPLE") and "gzip=false" in url and len(requests) == 2


def test_empty_catalog_is_distinct_from_provider_outage():
    from app.modules.overlays.provider import GAIA_COLUMNS
    from app.modules.overlays.service import catalogs

    provider = ContextProvider(
        Settings(_env_file=None),
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, content=(GAIA_COLUMNS + "\n").encode())
        ),
    )
    payload = {
        "request": {"region": {"ra_deg": 1, "dec_deg": 2, "search_radius_deg": 0.01}},
        "frames": {
            "common": [{"time": {"label_utc": "2026-01-01T00:00:00Z"}, "spatial": spatial()}]
        },
    }
    report = catalogs(provider, payload, "common", 0, "gaia", 100, True)
    assert report["status"] == "empty" and report["markers"] == [] and not report["truncated"]


def test_catalog_ordering_uses_irsa_supported_column_alias():
    from app.modules.overlays.provider import GAIA_COLUMNS

    def handler(request):
        query = request.url.params["QUERY"]
        assert " AS catalog_distance_arcsec " in query
        assert query.endswith("ORDER BY catalog_distance_arcsec")
        return httpx.Response(200, content=(GAIA_COLUMNS + ",catalog_distance_arcsec\n").encode())

    provider = ContextProvider(Settings(_env_file=None), transport=httpx.MockTransport(handler))
    rows, truncated, _ = provider.catalog("gaia", 1, 2, 0.1, 100)
    assert rows == [] and not truncated


@pytest.mark.parametrize("status", [302, 403, 503])
def test_context_http_failure_redirect_is_not_followed(status):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, headers={"Location": "https://evil.test/private"})

    provider = ContextProvider(Settings(_env_file=None), transport=httpx.MockTransport(handler))
    with pytest.raises(OverlayUnavailable, match="provider_http_error"):
        provider.catalog("gaia", 1, 2, 0.01, 2)
    assert len(calls) == 1


def test_context_body_limit_timeout_and_schema():
    provider = ContextProvider(
        Settings(_env_file=None),
        transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"x" * 2000001)),
    )
    with pytest.raises(OverlayUnavailable, match="provider_byte_limit"):
        provider.catalog("gaia", 1, 2, 0.01, 2)

    def timeout(request):
        raise httpx.ReadTimeout("private details", request=request)

    provider.transport = httpx.MockTransport(timeout)
    with pytest.raises(OverlayUnavailable, match=r"^provider_unavailable$"):
        provider.catalog("gaia", 1, 2, 0.01, 2)
    provider.transport = httpx.MockTransport(
        lambda r: httpx.Response(200, content=b"<html>bad</html>")
    )
    with pytest.raises(OverlayUnavailable, match="provider_schema_changed"):
        provider.catalog("gaia", 1, 2, 0.01, 2)


def test_wise_reprojection_grid_mask_and_band_metadata():
    s = spatial()
    header = fits.Header.fromstring(s["wcs_header"], sep="\n")
    header["BUNIT"] = "DN"
    pixels = np.ones((31, 31))
    pixels[15, 15] = 10
    pixels[0, :] = np.nan
    stream = io.BytesIO()
    fits.PrimaryHDU(pixels, header).writeto(stream)

    class Provider:
        def wise_image(self, *args):
            return (
                stream.getvalue(),
                {"date_obs1": "2010-01-01", "date_obs2": "2011-01-01"},
                "https://irsa.ipac.caltech.edu/test",
            )

    payload = {
        "request": {
            "region": {"ra_deg": 359.999, "dec_deg": 60, "width_arcmin": 1, "height_arcmin": 1}
        },
        "frames": {"common": [{"spatial": s}]},
    }
    result = image_layer(Provider(), payload, "common", 0, 2)
    assert result["metadata"]["band"] == "W2" and result["metadata"]["valid_fraction"] < 1
    with fits.open(io.BytesIO(result["fits"])) as hdus:
        assert hdus[0].data.shape == (31, 31) and hdus[0].data[15, 15] == pytest.approx(
            10, abs=1e-5
        )
        assert WCS(hdus[0].header).pixel_to_world_values(15, 15)[0] == pytest.approx(359.999)
    assert Image.open(io.BytesIO(result["png"])).mode == "RGBA"


def state():
    return ShareState(
        mode="native",
        request=PreparedViewRequest(
            contract_version="view-v2",
            region={
                "ra": "08:55:10.831",
                "dec": "-07:14:42.53",
                "width_arcmin": 3,
                "height_arcmin": 4,
            },
            collections=["spherex_qr3"],
            detectors=["D6"],
            start_at="2026-01-01T00:00:00Z",
            end_at="2026-05-01T00:00:00Z",
            preparation={
                "spectral_mode": "detector",
                "detector": "D6",
                "temporal_bin_seconds": 120,
                "stretch": "per_frame_asinh",
                "native_preview_policy": "inspect_flagged",
            },
            max_frames=8,
        ),
    )


def test_coordinate_url_roundtrip_all_settings_and_no_submission():
    original = state()
    query = encode(original)
    assert decode(query) == normalize(original)
    assert "ra=" in query and "width=3" in query
    with TestClient(app) as client:
        result = client.get("/api/v1/share/resolve?" + query)
        assert result.status_code == 200 and result.json()["automatic_submission"] is False
        assert ShareState.model_validate(result.json()["state"]) == normalize(original)
        linked = client.post("/api/v1/share/links", json=original.model_dump(mode="json"))
        assert linked.status_code == 200
        for extra in ["&ra=10", "&token=private", "&v=2", "&p_approve_science=true", "&width=NaN"]:
            assert client.get("/api/v1/share/resolve?" + query + extra).status_code == 422


def test_gif_order_captions_limits_sidecar_and_single_epoch(tmp_path):
    values = [10, 2]
    frames = [
        {"science": np.full((31, 31), v, dtype=float), "valid": np.ones((31, 31), bool)}
        for v in values
    ]
    sources = [
        {
            "metadata": {"mid_mjd": 60002 - i, "detector": "D5", "product_id": str(i)},
            "ref": {"view_id": str(uuid4()), "index": i},
            "raw": {"sha256": "a" * 64},
            "planes": {"sha256": "b" * 64},
        }
        for i in range(2)
    ]
    files = []

    def artifact(path, kind, ids):
        files.append((path, kind, ids))
        return len(files) - 1

    result = export_movie(
        frames, sources, {"frame_duration_ms": 800, "loop": False}, tmp_path, artifact
    )
    with Image.open(tmp_path / "movie.gif") as gif:
        assert gif.n_frames == 2 and gif.info["duration"] == 800 and "loop" not in gif.info
    sidecar = json.loads((tmp_path / "export_provenance.json").read_text())
    assert sidecar["frames"][0]["metadata"]["mid_mjd"] == 60001
    assert "NASA/IPAC IRSA" in sidecar["credits"] and result["animation"]


def test_embedding_csp_external_asset_and_no_inline_secrets():
    with TestClient(app) as client:
        response = client.get("/api/v1/share/embed/" + str(uuid4()))
        assert response.status_code == 200
        assert "frame-ancestors 'self'" in response.headers["content-security-policy"]
        assert "token" not in response.text and "onclick=" not in response.text
        assert client.get("/api/v1/share/assets/player.js").status_code == 200
        assert client.get("/api/v1/share/assets/private.env").status_code == 422
