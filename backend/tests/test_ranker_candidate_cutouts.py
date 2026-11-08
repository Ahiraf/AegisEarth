"""Native training-policy regression tests; researcher package is never patched."""

import hashlib
import json
import shutil
import time
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
from test_metadata_ranker import products

from app.modules.ranking import pipeline
from app.modules.ranking.package import PACKAGE, load_package
from app.modules.ranking.selection import candidate_exposures, query_products, select_product
from app.modules.ranking.visits import midpoint, select_visit


def setup_tracks(monkeypatch, count=12):
    source = products(count)
    for i, p in enumerate(source):
        p["source_metadata"] = {**p["source_metadata"], "obs_id": f"fixture-{i}"}
        p["footprint_icrs"] = "POLYGON ICRS 179 -1 181 -1 181 1 179 1"
    predictions = [
        {"mjd": midpoint(p), "ra": 179.85 + i * 0.025, "dec": 0, "v_mag": 12.0}
        for i, p in enumerate(source)
    ]
    candidate = {"name": "Drifting object", "number": 1, "v_mag": 12.0, "frames": predictions}
    job = {
        "id": str(uuid4()),
        "config": {
            "products": source,
            "selection_products": source,
            "max_candidates": 24,
            "limits": {"total_bytes": 268435456, "per_file_bytes": 134217728},
        },
    }
    features, _, model = load_package()
    case = json.loads((PACKAGE / "golden/cases.json").read_text())["cases"][0]
    seed = case["frames"][0]
    calls = []

    def acquire(product, center, path, *args, on_download=None, **kwargs):
        calls.append((product, center))
        if on_download:
            on_download()
        shutil.copyfile(PACKAGE / "golden" / seed["file"], path)
        # Re-centre the WCS so the same real native patch surrounds each predicted position.
        # The pixel data, flags, variance and package QC stay real and unchanged.
        with fits.open(path, mode="update") as h:
            wcs = WCS(h["IMAGE"].header).celestial
            x, y = wcs.world_to_pixel(SkyCoord(seed["ra"], seed["dec"], unit="deg"))
            wcs.wcs.crpix = [float(x) + 1, float(y) + 1]
            wcs.wcs.crval = [center["ra_deg"], center["dec_deg"]]
            h["IMAGE"].header.update(wcs.to_header())
        return {
            "product_id": product["id"],
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "size_bytes": path.stat().st_size,
            "source_url": pipeline.native_url(product, center),
        }

    monkeypatch.setattr(pipeline, "acquire", acquire)
    monkeypatch.setattr(
        pipeline, "read_native", lambda *_: SimpleNamespace(metadata={"spectral": {}})
    )
    return job, candidate, (features, None, model), calls


def run(job, tmp_path, candidates, package, **kwargs):
    return pipeline.process_candidates(
        job,
        tmp_path,
        candidates,
        package,
        None,
        kwargs.pop("deadline", time.monotonic() + 1000),
        lambda *_: None,
        lambda *_: None,
        **kwargs,
    )


def test_drift_beyond_shared_cutout_half_width_still_has_four_native_usable_frames(
    monkeypatch, tmp_path
):
    job, candidate, package, calls = setup_tracks(monkeypatch)
    assert (candidate["frames"][-1]["ra"] - candidate["frames"][0]["ra"]) * 60 > 7.5
    result, stats, limited = run(job, tmp_path, [candidate], package)
    assert not limited and len(calls) == 8 and stats["cutout_downloads"] == 8
    row = result[0]
    assert row["score"] is not None and row["evidence"]["n_frames_used"] >= 4
    assert row["evidence"]["cutout_policy"] == "per_candidate_centered_v1"
    downloaded = [f for f in row["evidence"]["frames"] if "product_id" in f]
    assert len(downloaded) == len({f["mid_mjd"] for f in downloaded})
    assert all(
        f["cutout_center"] == {"ra_deg": f["ra_deg"], "dec_deg": f["dec_deg"]} for f in downloaded
    )
    assert all("POSITION_NEAR_EDGE_OR_OUTSIDE" not in f["reasons"] for f in downloaded)


def test_faint_candidate_has_zero_downloads_rank_calls_or_product_ids(monkeypatch, tmp_path):
    job, candidate, package, calls = setup_tracks(monkeypatch)
    candidate["v_mag"] = 18.1001
    features = SimpleNamespace(
        rank=lambda *a, **k: pytest.fail("Faint candidate must not call rank")
    )
    result, stats, _ = run(job, tmp_path, [candidate], (features, None, package[2]))
    assert calls == [] and stats["cutout_downloads"] == 0
    row = result[0]
    assert row["score"] is row["score_uncertainty"] is None
    assert row["classification"] == "uncertain"
    assert row["warnings"] == ["PREDICTED_FAINTER_THAN_TRAINING_RANGE"]
    assert all("product_id" not in f and not f["used_for_score"] for f in row["evidence"]["frames"])
    assert row["ra_deg"] == candidate["frames"][len(candidate["frames"]) // 2]["ra"]


def test_one_containing_detector_per_exposure_and_midpoint_join(monkeypatch):
    job, candidate, _, _ = setup_tracks(monkeypatch)
    first = job["config"]["products"][0]
    second = {
        **first,
        "id": "different",
        "detector": "D6",
        "exposure_key": first["exposure_key"].replace("D1", "D6"),
    }
    selected, origin = select_product(
        [second, first],
        first,
        candidate["frames"][0],
        time.monotonic() + 1,
        query=lambda *_: pytest.fail("Covered snapshot must not query IRSA"),
    )
    assert selected["id"] == first["id"] and origin == "discovery_snapshot"
    joined = candidate_exposures(candidate, job["config"]["products"] + [second])
    assert len(joined) == 12 and len({f["mjd"] for f, _ in joined}) == 12
    assert len(select_visit(job["config"]["products"] + [second], 0, 12)) == 12


def test_point_time_fallback_skips_wrong_exposure_and_noncontaining_products(monkeypatch):
    job, candidate, _, _ = setup_tracks(monkeypatch)
    first = job["config"]["products"][0]
    wrong = {**first, "source_metadata": {**first["source_metadata"], "obs_id": "wrong"}}
    selected, origin = select_product(
        [], first, candidate["frames"][0], time.monotonic() + 1, query=lambda *_: [wrong, first]
    )
    assert selected["id"] == first["id"] and origin == "irsa_point_time_query"
    assert (
        select_product(
            [], first, candidate["frames"][0], time.monotonic() + 1, query=lambda *_: [wrong]
        )[0]
        is None
    )


def test_wall_stop_retains_all_unprocessed_bright_candidates(monkeypatch, tmp_path):
    job, candidate, package, calls = setup_tracks(monkeypatch)
    others = [{**candidate, "name": name, "v_mag": mag} for name, mag in [("B", 13), ("C", 14)]]
    result, stats, limited = run(
        job, tmp_path, [candidate, *others], package, deadline=0, clock=lambda: 1
    )
    assert limited and stats["wall_time_limit_reached"] and calls == []
    assert len(result) == 3 and all(c["score"] is None for c in result)
    assert all(c["warnings"] == ["BACKEND_WALL_TIME_LIMIT_REACHED"] for c in result)


def test_bright_limit_applies_after_faint_filter_and_brightest_first(monkeypatch, tmp_path):
    job, candidate, package, calls = setup_tracks(monkeypatch)
    job["config"]["max_candidates"] = 1
    faint = {**candidate, "name": "Faint", "v_mag": 23}
    dimmer = {**candidate, "name": "Dimmer", "v_mag": 17}
    rows, _, limited = run(job, tmp_path, [faint, dimmer, candidate], package)
    assert limited and [c["name"] for c in rows] == [candidate["name"], "Dimmer", "Faint"]
    assert rows[0]["score"] is not None and len(calls) == 8
    assert rows[1]["warnings"] == ["BACKEND_CANDIDATE_LIMIT_REACHED"]


def test_tap_query_uses_contains_point_and_time_predicates():
    def respond(request):
        query = request.url.params["QUERY"]
        assert "CONTAINS(POINT('ICRS'," in query and ",s_region)=1" in query
        assert "t_min <=" in query and "t_max >=" in query
        return httpx.Response(200, text="obs_id\n")

    assert (
        query_products(
            180,
            0,
            61030,
            "spherex_qr2",
            time.monotonic() + 2,
            transport=httpx.MockTransport(respond),
        )
        == []
    )


def test_fallback_joins_compact_snapshot_identity_to_full_irsa_metadata(monkeypatch):
    job, candidate, _, _ = setup_tracks(monkeypatch)
    full = job["config"]["products"][0]
    full["exposure_key"] = "spherex:fixture-0:D1"
    compact = {k: v for k, v in full.items() if k != "source_metadata"}
    selected, origin = select_product(
        [], compact, candidate["frames"][0], time.monotonic() + 1, query=lambda *_: [full]
    )
    assert selected["id"] == full["id"] and origin == "irsa_point_time_query"


def test_more_exposures_are_fetched_only_after_initial_eight_fail_qc(monkeypatch, tmp_path):
    job, candidate, package, calls = setup_tracks(monkeypatch)
    acquire = pipeline.acquire
    failed_ids = {job["config"]["products"][i]["id"] for i in [0, 2, 3, 5, 6, 8, 9, 11]}

    def fetch(product, center, path, *args, **kwargs):
        receipt = acquire(product, center, path, *args, **kwargs)
        if product["id"] in failed_ids:
            with fits.open(path, mode="update") as hdus:
                hdus["IMAGE"].header["L2DQAFLG"] = "Fail"
        return receipt

    monkeypatch.setattr(pipeline, "acquire", fetch)
    rows, _, _ = run(job, tmp_path, [candidate], package)
    assert len(calls) == 12 and rows[0]["score"] is not None
    assert rows[0]["evidence"]["n_frames_used"] == 4
    assert sum("FRAME_FAILED_QC" in f["reasons"] for f in rows[0]["evidence"]["frames"]) == 8
