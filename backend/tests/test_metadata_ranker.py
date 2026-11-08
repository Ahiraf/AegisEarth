"""Scientific mapping, asynchronous admission and atomic publication for package v2."""

import copy
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
from test_views import pg_engine  # noqa: F401 -- shared disposable PostgreSQL fixture

from app.core.config import Settings
from app.core.database import get_db
from app.core.gateway import GatewayConflict
from app.main import app
from app.modules.candidates.models import Candidate
from app.modules.observations.provider import parse_response
from app.modules.observations.repository import DiscoveryRepository
from app.modules.observations.router import get_discovery_service
from app.modules.ranking.package import MODEL_SHA256, MODEL_VERSION, PACKAGE, load_package
from app.modules.ranking.pipeline import map_candidate, score_candidates
from app.modules.ranking.schemas import MetadataRankerRequest
from app.modules.ranking.service import submit
from app.modules.ranking.visits import midpoint, native_url, reject_preset_field, select_visit
from app.modules.targets.catalog import load_targets
from app.modules.views.repository import NativeViewRepository
from app.modules.views.security import PublicTokens, token_digest


def products(count=6):
    template = parse_response(
        (Path(__file__).parent / "fixtures/observations/qr3_one.xml").read_bytes(), "spherex_qr3"
    )[0][0]
    return [
        {
            **template,
            "id": str(uuid4()),
            "exposure_key": f"fixture:{i}:D1",
            "start_mjd": str(61030 + i * 0.02),
            "end_mjd": str(61030 + i * 0.02 + 0.0001),
        }
        for i in range(count)
    ]


def test_package_manifest_matches_every_supplied_file():
    manifest = json.loads((PACKAGE / "MANIFEST.json").read_text())
    for name, expected in manifest["files"].items():
        content = (PACKAGE / name).read_bytes()
        assert hashlib.sha256(content).hexdigest() == expected["sha256"], name
    assert manifest["files"]["ranker_AB_v3.json"]["sha256"] == MODEL_SHA256


def test_visit_selection_spreads_deduplicates_processing_and_splits_gaps():
    first = products(20)
    duplicates = [{**p, "id": str(uuid4()), "exposure_key": p["exposure_key"]} for p in first]
    later = [
        {
            **p,
            "start_mjd": str(float(p["start_mjd"]) + 2),
            "end_mjd": str(float(p["end_mjd"]) + 2),
            "exposure_key": "later:" + p["exposure_key"],
        }
        for p in products()
    ]
    selected = select_visit(first + duplicates + later, 0, 12)
    assert len(selected) == 12 and selected[0] == first[0] and selected[-1] == first[-1]
    assert select_visit(first + later, 1, 6) == later
    with pytest.raises(ValueError, match="six_distinct"):
        select_visit(products(5), 0, 6)
    query = parse_qs(urlsplit(native_url(first[0], {"ra_deg": 179.8, "dec_deg": -0.6})).query)
    assert query["size"] == ["15arcmin"]


@pytest.mark.parametrize("target", load_targets(), ids=lambda t: t.slug)
def test_all_five_presets_are_excluded(target):
    with pytest.raises(ValueError, match="not_for_preset"):
        reject_preset_field({"ra_deg": target.ra_deg, "dec_deg": target.dec_deg}, products())


def test_golden_mapping_keeps_hint_null_scores_uncertainty_and_provenance():
    features, _, model = load_package()
    cases = json.loads((PACKAGE / "golden/cases.json").read_text())["cases"]
    for case in cases:
        frames = [{**f, "path": str(PACKAGE / "golden" / f["file"])} for f in case["frames"]]
        kwargs = case["kwargs"]
        result = features.rank(frames, model, **kwargs)
        source = [
            {
                "id": f"product-{i}",
                "start_mjd": str(f["mjd"]),
                "end_mjd": str(f["mjd"]),
                "detector": "D1",
            }
            for i, f in enumerate(frames)
        ]
        metadata = [{"spectral": {"test_fixture": True}} for _ in frames]
        candidate = {"name": "golden fixture", "frames": frames, "v_mag": kwargs["v_mag"]}
        mapped = map_candidate(candidate, result, frames, source, metadata, str(uuid4()))
        assert mapped["classification"] == case["expected"]["classification_hint"]
        assert mapped["score"] == result["score"]
        assert mapped["score_uncertainty"] == result["uncertainty"]
        assert mapped["warnings"] == result["warnings"]
        assert mapped["score_kind"] == "candidate_score" and mapped["method"] == "metadata_ranker"
        assert mapped["evidence"]["ten_percent_flag"] == "informational_only"
        assert "path" not in mapped["evidence"]["frames"][0]


def test_scoring_passes_predicted_positions_magnitudes_and_normalized_version(monkeypatch):
    source = products()
    for p in source:
        p["calibration_version"] = "l2b-v27-2026-100"
    frames = [{"mjd": midpoint(p), "ra": 180 + i * 0.001, "dec": 0} for i, p in enumerate(source)]
    supplied = {"name": "Known mover", "number": 1, "v_mag": 19.5, "frames": frames}
    captured = {}

    def rank(native, model, **kwargs):
        captured.update(kwargs)
        captured["frames"] = native
        return {
            "score": 0.8,
            "uncertainty": 0.02,
            "classification_hint": "uncertain",
            "frames_used": [f["path"] for f in native],
            "warnings": [],
            "displacement_arcsec": 18,
            "explanation_codes": [],
            "span_hours": 2.4,
            "n_frames_used": 6,
            "evidence": {},
            "meets_5pct_threshold": True,
            "meets_10pct_threshold": True,
        }

    monkeypatch.setattr(
        "app.modules.ranking.pipeline.load_package",
        lambda: (SimpleNamespace(rank=rank), None, {"limited_versions": ["l2b-v27"]}),
    )
    monkeypatch.setattr(
        "app.modules.ranking.pipeline.read_native",
        lambda *_: SimpleNamespace(metadata={"spectral": {"local_wavelength_um": 1.2}}),
    )
    result = score_candidates(
        [Path(f"{i}.fits") for i in range(6)], source, {}, [supplied], str(uuid4()), 24
    )[0]
    assert captured["v_mag"] == 19.5 and captured["version"] == "l2b-v27"
    assert captured["frames"][2]["ra"] == frames[2]["ra"]
    # Never re-label by the score, even when it is high and the 10% flag is true.
    assert result["classification"] == "uncertain" and result["score"] == 0.8


@pytest.fixture
def ranker_context(pg_engine, tmp_path, monkeypatch):  # noqa: F811 -- pytest fixture injection
    with pg_engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE processing_jobs, discovery_snapshots, source_products, "
                "analysis_runs, model_versions CASCADE"
            )
        )
    with Session(pg_engine) as session:
        settings = Settings(
            _env_file=None,
            public_token_secret="test-ranker-secret-" * 4,
            public_cookie_secure=False,
            metadata_ranker_enabled=True,
            artifact_root=str(tmp_path),
        )
        discovery = DiscoveryRepository(session)
        source = products()
        snapshot = {
            "id": str(uuid4()),
            "query_hash": "a" * 64,
            "created_at_utc": datetime.now(UTC).isoformat(),
            "canonical_query": {"region": {"ra_deg": 179.8, "dec_deg": -0.6}},
            "items": source,
            "warnings": [],
        }
        discovery.save(snapshot, source)
        monkeypatch.setattr("app.modules.ranking.service.available", lambda: True)
        yield session, settings, discovery, snapshot


def admit(context, key=None):
    session, settings, discovery, snapshot = context
    return submit(
        MetadataRankerRequest(contract_version="metadata-ranker-v1", snapshot_id=snapshot["id"]),
        NativeViewRepository(session),
        discovery,
        settings,
        PublicTokens(settings),
        "a" * 64,
        "b" * 64,
        key or uuid4(),
    )


def test_admission_is_idempotent_queued_and_disabled_independently(ranker_context):
    session, settings, _, _ = ranker_context
    key = uuid4()
    first, status = admit(ranker_context, key)
    assert status == 202
    assert admit(ranker_context, key)[0]["id"] == first["id"]
    job = NativeViewRepository(session).rpc("ranker_get", {"p_id": first["id"]})
    assert job["status"] == "queued" and job["result"] is None
    settings.metadata_ranker_enabled = False
    with pytest.raises(HTTPException) as error:
        admit(ranker_context)
    assert error.value.status_code == 503


def test_api_admits_without_skybot_and_legacy_contract_stays_disabled(ranker_context, monkeypatch):
    session, settings, discovery, snapshot = ranker_context
    monkeypatch.setattr("app.modules.analyses.router.get_settings", lambda: settings)
    monkeypatch.setattr("app.modules.views.router.get_settings", lambda: settings)
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_discovery_service] = lambda: SimpleNamespace(repository=discovery)
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/analyses",
                headers={"Idempotency-Key": str(uuid4())},
                json={"contract_version": "metadata-ranker-v1", "snapshot_id": snapshot["id"]},
            )
            assert response.status_code == 202, response.text
            assert client.get(response.json()["status_url"]).status_code == 202
            assert response.json()["method"] == "metadata_ranker"
            legacy = client.post(
                "/api/v1/analyses",
                json={"observation_ids": ["one", "two"], "center_ra_deg": 180, "center_dec_deg": 0},
            )
            assert legacy.status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_candidate_publication_is_atomic_fenced_and_preserves_nulls(ranker_context):
    session, _, _, _ = ranker_context
    accepted, _ = admit(ranker_context)
    repo = NativeViewRepository(session)
    job = repo.rpc("claim_view_job", {"p_worker": "ranker-test", "p_capacity": 2})
    parameters = {"p_id": accepted["id"], "p_token": job["lease_token"]}
    records = []
    for i, product in enumerate(job["config"]["products"]):
        sha = hashlib.sha256(f"fixture-{i}".encode()).hexdigest()
        record = {
            "id": str(uuid4()),
            "view_id": job["id"],
            "product_id": product["id"],
            "sha256": sha,
            "size_bytes": 10,
            "storage_key": f"objects/{job['id']}/{job['lease_token']}/{sha}.fits",
        }
        repo.rpc("view_pin", {**parameters, "p_product": product["id"], "p_sha": sha})
        repo.rpc("view_prepare_upload", {**parameters, "p_file": record})
        records.append(record)
    candidate = {
        "id": str(uuid4()),
        "classification": "uncertain",
        "classification_hint": "uncertain",
        "ra_deg": 179.8,
        "dec_deg": -0.6,
        "displacement_arcsec": 5,
        "score": None,
        "score_uncertainty": None,
        "score_kind": "candidate_score",
        "model_version_id": MODEL_VERSION,
        "warnings": ["TOO_FEW_USABLE_FRAMES"],
        "evidence": {"method": "metadata_ranker"},
    }
    report = {
        "method": "metadata_ranker",
        "score_kind": "candidate_score",
        "model": {"version": MODEL_VERSION, "sha256": MODEL_SHA256},
        "candidates": [candidate],
    }
    invalid = copy.deepcopy(report)
    invalid["candidates"][0]["classification"] = "possible_motion"
    with pytest.raises(DBAPIError):
        repo.rpc("ranker_complete", {**parameters, "p_files": records, "p_report": invalid})
    assert repo.rpc("ranker_get", {"p_id": job["id"]})["status"] == "running"
    assert session.scalar(select(Candidate)) is None
    with pytest.raises(GatewayConflict):
        repo.rpc(
            "ranker_complete",
            {**parameters, "p_token": str(uuid4()), "p_files": records, "p_report": report},
        )
    repo.rpc("ranker_complete", {**parameters, "p_files": records, "p_report": report})
    stored = session.scalar(select(Candidate))
    assert stored.classification == "uncertain" and stored.score is None
    assert stored.score_uncertainty is None and stored.warnings == candidate["warnings"]
    assert repo.rpc("ranker_get", {"p_id": job["id"]})["result"] == report


def test_ranker_cancellation_prevents_completion(ranker_context):
    session, _, _, _ = ranker_context
    accepted, _ = admit(ranker_context)
    repo = NativeViewRepository(session)
    job = repo.rpc("claim_view_job", {"p_worker": "ranker-test", "p_capacity": 2})
    repo.rpc("view_cancel", {"p_id": job["id"], "p_digest": token_digest(accepted["cancel_token"])})
    with pytest.raises(GatewayConflict):
        repo.rpc(
            "ranker_complete",
            {"p_id": job["id"], "p_token": job["lease_token"], "p_files": [], "p_report": {}},
        )


def test_ranker_failure_leaves_viewer_queue_usable(ranker_context):
    from test_views import service as viewer_service
    from test_views import submit as submit_view

    from app.modules.views.worker import process_job

    session, settings, _, _ = ranker_context
    accepted, _ = admit(ranker_context)
    repo = NativeViewRepository(session)
    job = repo.rpc("claim_view_job", {"p_worker": "ranker-failure-test", "p_capacity": 2})
    settings.metadata_ranker_enabled = False
    assert process_job(repo, job, settings) == "failed"
    failed = repo.rpc("ranker_get", {"p_id": accepted["id"]})
    assert failed["status"] == "failed" and failed["error_code"] == "metadata_ranker_disabled"
    assert session.scalar(select(Candidate)) is None
    view = submit_view(viewer_service(session, settings))
    next_job = repo.rpc("claim_view_job", {"p_worker": "viewer-still-works", "p_capacity": 2})
    assert next_job["id"] == view["id"] and next_job["kind"] == "view"
