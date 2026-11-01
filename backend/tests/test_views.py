import hashlib
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.gateway import GatewayConflict, GatewayQuota
from app.main import app
from app.modules.artifacts.cleanup import cleanup
from app.modules.artifacts.storage import LocalStore
from app.modules.observations.discovery import DiscoveryService
from app.modules.observations.provider import parse_response
from app.modules.observations.repository import DiscoveryRepository
from app.modules.observations.router import get_discovery_service
from app.modules.views.models import ViewSubmission
from app.modules.views.repository import NativeViewRepository
from app.modules.views.schemas import ViewRequest
from app.modules.views.security import PublicTokens, token_digest
from app.modules.views.service import ViewService

SECRET = "test-public-secret-" * 4


@pytest.fixture(scope="module")
def pg_engine():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        pytest.skip("PostgreSQL integration requires the disposable TEST_DATABASE_URL")
    from sqlalchemy.engine import make_url

    if "test" not in make_url(url).database:
        raise RuntimeError("View tests require an explicitly named disposable test database")
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()
    try:
        command.upgrade(Config("alembic.ini"), "head")
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
        get_settings.cache_clear()
    engine = create_engine(url)
    yield engine
    engine.dispose()


class RecordedProvider:
    def search(self, collection, params):
        rows, _ = parse_response(
            (Path(__file__).parent / "fixtures/observations/qr3_one.xml").read_bytes(),
            "spherex_qr3",
        )
        return rows, {"collection": collection, "status": "FIXTURE_SUBSET", "truncated": True}


def request(**changes):
    return ViewRequest(
        **(
            {
                "contract_version": "view-v1",
                "region": {"ra": 269.45, "dec": 4.76},
                "collections": ["spherex_qr3"],
                "max_frames": 1,
            }
            | changes
        )
    )


def service(session, settings):
    return ViewService(
        NativeViewRepository(session),
        DiscoveryService(DiscoveryRepository(session), RecordedProvider()),
        settings,
        PublicTokens(settings),
    )


@pytest.fixture
def context(pg_engine, tmp_path):
    with pg_engine.begin() as connection:
        connection.execute(
            text("TRUNCATE processing_jobs, discovery_snapshots, source_products CASCADE")
        )
    with Session(pg_engine) as session:
        settings = Settings(
            _env_file=None,
            public_token_secret=SECRET,
            public_cookie_secure=False,
            artifact_root=str(tmp_path / "artifacts"),
        )
        yield session, settings, service(session, settings)


def submit(svc, scope="a" * 64, ip="b" * 64, key=None, query=None):
    return svc.submit(query or request(), scope, ip, key or str(uuid4()))[0]


def claim(repo, worker="fixture-worker", capacity=2):
    return repo.rpc("claim_view_job", {"p_worker": worker, "p_capacity": capacity})


def test_durable_idempotency_conflict_and_outage_independent_replay(context):
    session, _settings, svc = context
    key = str(uuid4())
    first = submit(svc, key=key)
    svc.discovery = None
    replay = submit(svc, key=key)
    assert first["id"] == replay["id"] and first["cancel_token"] == replay["cancel_token"]
    assert session.scalar(select(func.count()).select_from(ViewSubmission)) == 1
    with pytest.raises(GatewayConflict):
        submit(svc, key=key, query=request(max_frames=2))


def test_quota_is_atomic_between_two_submitters(context, pg_engine):
    _, settings, _ = context
    settings.view_max_active_per_client = 1

    def accept(_):
        with Session(pg_engine) as session:
            try:
                return submit(service(session, settings))["id"]
            except GatewayQuota:
                return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(accept, range(2)))
    assert sum(r is not None for r in results) == 1


def test_hourly_and_global_caps(context):
    _session, settings, svc = context
    settings.view_max_hourly_per_ip = 1
    first = submit(svc)
    svc.repository.rpc(
        "view_cancel", {"p_id": first["id"], "p_digest": token_digest(first["cancel_token"])}
    )
    with pytest.raises(GatewayQuota):
        submit(svc, scope="c" * 64)
    settings.view_max_hourly_per_ip = 30
    settings.view_max_queue = 1
    submit(svc, scope="c" * 64)
    with pytest.raises(GatewayQuota):
        submit(svc, scope="d" * 64)


def test_two_workers_lease_recovery_cancel_and_pin_change(context, pg_engine):
    _, _, svc = context
    view = submit(svc)

    def take(worker):
        with Session(pg_engine) as session:
            return claim(NativeViewRepository(session), worker)

    with ThreadPoolExecutor(max_workers=2) as pool:
        claimed = list(pool.map(take, ["one", "two"]))
    jobs = [j for j in claimed if j]
    assert len(jobs) == 1
    old = jobs[0]
    repo = svc.repository
    params = {"p_id": view["id"], "p_token": old["lease_token"]}
    product = old["config"]["products"][0]["id"]
    repo.rpc("view_pin", {**params, "p_product": product, "p_sha": "a" * 64})
    with pytest.raises(GatewayConflict):
        repo.rpc("view_pin", {**params, "p_product": product, "p_sha": "b" * 64})
    with pg_engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE processing_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=:id"
            ),
            {"id": view["id"]},
        )
    recovered = claim(repo, "recovered")
    assert recovered["attempt"] == 2 and recovered["pins"][product] == "a" * 64
    with pytest.raises(GatewayConflict):
        repo.rpc("complete_view", {**params, "p_files": []})
    assert repo.rpc("view_cancel", {"p_id": view["id"], "p_digest": "f" * 64}) is None
    repo.rpc("view_cancel", {"p_id": view["id"], "p_digest": token_digest(view["cancel_token"])})
    with pytest.raises(GatewayConflict):
        repo.rpc("view_heartbeat", {"p_id": view["id"], "p_token": recovered["lease_token"]})
    public = repo.rpc("view_get", {"p_id": view["id"]})
    assert (
        public["status"] == "canceled"
        and "cancel_digest" not in public
        and "lease_token" not in public
    )


def publish(svc, settings):
    view = submit(svc)
    repo = svc.repository
    job = claim(repo)
    body = b"artifact fixture"
    sha = hashlib.sha256(body).hexdigest()
    params = {"p_id": view["id"], "p_token": job["lease_token"]}
    file = {
        "id": str(uuid4()),
        "view_id": view["id"],
        "product_id": job["config"]["products"][0]["id"],
        "sha256": sha,
        "size_bytes": len(body),
        "storage_key": f"objects/{view['id']}/{job['lease_token']}/{sha}.fits",
    }
    repo.rpc("view_pin", {**params, "p_product": file["product_id"], "p_sha": sha})
    repo.rpc("view_prepare_upload", {**params, "p_file": file})
    assert repo.rpc("view_artifact", {"p_id": file["id"]}) is None
    path = Path(settings.artifact_root) / "fixture"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    store = LocalStore(settings.artifact_root)
    store.put(path, file)
    repo.rpc("complete_view", {**params, "p_files": [file]})
    return view, file, store


def test_fenced_publication_cache_owner_and_bounded_cleanup(context):
    session, settings, svc = context
    view, file, store = publish(svc, settings)
    public = svc.repository.rpc("view_get", {"p_id": view["id"]})
    assert (
        public["result"]["stage"] == "inputs_ready" and "storage_key" not in public["artifacts"][0]
    )
    cached = submit(svc, scope="c" * 64)
    assert cached["id"] == view["id"] and "cancel_token" not in cached
    session.execute(
        text("UPDATE sky_views SET expires_at=now()-interval '1 second' WHERE id=:id"),
        {"id": view["id"]},
    )
    session.commit()
    assert svc.repository.rpc("view_artifact", {"p_id": file["id"]}) is None
    assert cleanup(session, store, settings, limit=1)["objects_deleted"] == 1
    assert not store.path(file["storage_key"]).exists()


def test_api_cookie_idempotency_cancel_and_verified_download(context, monkeypatch):
    session, settings, svc = context
    monkeypatch.setattr("app.modules.views.router.get_settings", lambda: settings)
    monkeypatch.setattr("app.modules.artifacts.router.get_settings", lambda: settings)
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_discovery_service] = lambda: svc.discovery
    try:
        with TestClient(app) as client:
            assert client.get("/api/v1/views/session").status_code == 200
            assert "httponly" in client.get("/api/v1/views/session").headers["set-cookie"].lower()
            headers = {"Idempotency-Key": str(uuid4())}
            body = request().model_dump(mode="json")
            accepted = client.post("/api/v1/views", json=body, headers=headers)
            assert accepted.status_code == 202, accepted.text
            data = accepted.json()
            assert (
                client.post("/api/v1/views", json=body, headers=headers).json()["id"] == data["id"]
            )
            assert (
                client.post(
                    "/api/v1/views", json={**body, "max_frames": 2}, headers=headers
                ).status_code
                == 409
            )
            assert client.get(data["job_url"]).json()["status"] == "queued"
            assert (
                client.post(
                    data["status_url"] + "/cancel", headers={"Authorization": "Bearer " + "f" * 64}
                ).status_code
                == 404
            )
            assert (
                client.post(
                    data["status_url"] + "/cancel",
                    headers={"Authorization": "Bearer " + data["cancel_token"]},
                ).json()["status"]
                == "canceled"
            )
            _view, file, store = publish(svc, settings)
            response = client.get(f"/api/v1/artifacts/{file['id']}/content")
            assert response.content == b"artifact fixture" and response.status_code == 200
            store.path(file["storage_key"]).write_bytes(b"damaged")
            assert client.get(f"/api/v1/artifacts/{file['id']}/content").status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_cancellation_terminates_an_actual_running_child(context, pg_engine, monkeypatch):
    import subprocess
    import sys
    import time

    import psutil

    from app.modules.views.worker import process_job

    _, settings, svc = context
    view = submit(svc)
    job = claim(svc.repository)
    original = subprocess.Popen
    processes = []

    def start_sleeping_child(*args, **kwargs):
        child = original([sys.executable, "-c", "import time; time.sleep(60)"], **kwargs)
        processes.append(child)
        return child

    monkeypatch.setattr("app.modules.views.worker.subprocess.Popen", start_sleeping_child)

    def run():
        with Session(pg_engine) as session:
            return process_job(NativeViewRepository(session), job, settings)

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(run)
        deadline = time.monotonic() + 10
        while not processes and time.monotonic() < deadline:
            time.sleep(0.05)
        assert processes
        svc.repository.rpc(
            "view_cancel", {"p_id": view["id"], "p_digest": token_digest(view["cancel_token"])}
        )
        assert future.result(timeout=10) == "fenced"
    assert not psutil.pid_exists(processes[0].pid)
    assert svc.repository.rpc("view_get", {"p_id": view["id"]})["artifacts"] == []


def test_prepared_publication_rolls_back_raw_publication_and_fences(context):
    from app.modules.views.models import ViewFile
    from app.modules.views.schemas import PreparedViewRequest

    session, _settings, svc = context
    query = PreparedViewRequest(
        **(request().model_dump(mode="json") | {"contract_version": "view-v2"})
    )
    accepted = submit(svc, query=query)
    repo = svc.repository
    job = claim(repo)
    assert job["config"]["preparation"]["spectral_mode"] == "common_available"
    params = {"p_id": accepted["id"], "p_token": job["lease_token"]}
    product = job["config"]["products"][0]["id"]
    sha = "a" * 64
    raw = {
        "id": str(uuid4()),
        "view_id": job["id"],
        "product_id": product,
        "sha256": sha,
        "size_bytes": 10,
        "storage_key": f"objects/{job['id']}/{job['lease_token']}/{sha}.fits",
    }
    repo.rpc("view_pin", {**params, "p_product": product, "p_sha": sha})
    repo.rpc("view_prepare_upload", {**params, "p_file": raw})
    derived = {
        "id": str(uuid4()),
        "view_id": job["id"],
        "source_product_ids": [product],
        "sha256": "b" * 64,
        "size_bytes": 10,
        "storage_key": f"objects/{job['id']}/{job['lease_token']}/{'b' * 64}.png",
        "content_type": "image/png",
    }
    report = {"version": "fixture", "sequence_eligible": False, "frames": [], "artifacts": []}
    with pytest.raises(GatewayConflict):
        repo.rpc(
            "complete_prepared_view",
            {**params, "p_files": [raw], "p_derived": [derived], "p_report": report},
        )
    session.expire_all()
    assert not session.get(ViewFile, raw["id"]).published
    assert repo.rpc("view_get", {"p_id": job["id"]})["status"] == "running"
    repo.rpc("prepare_frame_upload", {**params, "p_file": derived})
    assert repo.rpc("view_artifact", {"p_id": derived["id"]}) is None
    finished = repo.rpc(
        "complete_prepared_view",
        {**params, "p_files": [raw], "p_derived": [derived], "p_report": report},
    )
    assert finished["result"]["stage"] == "frames_prepared"
    assert repo.rpc("frame_set_get", {"p_id": job["id"]}) == report
    assert repo.rpc("view_artifact", {"p_id": derived["id"]})["content_type"] == "image/png"
    with pytest.raises(GatewayConflict):
        repo.rpc(
            "complete_prepared_view",
            {**params, "p_files": [raw], "p_derived": [derived], "p_report": report},
        )


def test_movie_manifest_is_source_bound_immutable_and_expiry_scoped(context):
    from app.modules.preprocessing.models import PreparedFrameSet
    from app.modules.views.movie import fingerprint

    session, settings, svc = context
    view, _, _ = publish(svc, settings)
    report = {"version": "test", "frames": []}
    session.add(PreparedFrameSet(view_id=view["id"], report=report))
    session.commit()
    payload = {
        "manifest_version": "movie-v1",
        "view_id": view["id"],
        "frames": {"common": [], "native": []},
    }
    params = {
        "p_id": view["id"],
        "p_report": report,
        "p_payload": payload,
        "p_sha256": fingerprint(payload),
    }
    with pytest.raises(GatewayConflict):
        svc.repository.rpc("movie_publish", params | {"p_report": {"wrong": "source"}})
    first = svc.repository.rpc("movie_publish", params)
    changed = payload | {"extra": "must not replace original"}
    assert (
        svc.repository.rpc(
            "movie_publish", params | {"p_payload": changed, "p_sha256": fingerprint(changed)}
        )
        == first
    )
    assert svc.repository.rpc("movie_lookup", {"p_id": view["id"]}) == first
    session.execute(
        text("UPDATE sky_views SET expires_at=now()-interval '1 second' WHERE id=:id"),
        {"id": view["id"]},
    )
    session.commit()
    assert svc.repository.rpc("movie_lookup", {"p_id": view["id"]}) is None
    with pytest.raises(GatewayConflict):
        svc.repository.rpc("movie_publish", params)


def test_prepared_and_raw_cleanup_share_one_ordered_cursor(context):
    from app.modules.preprocessing.models import PreparedArtifact

    session, settings, svc = context
    view, raw, store = publish(svc, settings)
    body = b"derived preview"
    sha = hashlib.sha256(body).hexdigest()
    key = raw["storage_key"].rsplit("/", 1)[0] + "/" + sha + ".png"
    file = {
        "id": "00000000-0000-0000-0000-000000000001",
        "view_id": view["id"],
        "storage_key": key,
        "sha256": sha,
        "size_bytes": len(body),
        "content_type": "image/png",
    }
    path = Path(settings.artifact_root) / "derived"
    path.write_bytes(body)
    store.put(path, file)
    session.add(
        PreparedArtifact(
            id=file["id"], view_id=view["id"], payload=file, published=True, storage_deleted=False
        )
    )
    session.execute(
        text("UPDATE sky_views SET expires_at=now()-interval '1 second' WHERE id=:id"),
        {"id": view["id"]},
    )
    session.commit()
    first = cleanup(session, store, settings, limit=1)
    assert not store.path(key).exists() and store.path(raw["storage_key"]).exists()
    second = cleanup(session, store, settings, limit=1, cursor=first["next_cursor"])
    assert second["objects_deleted"] == 1 and not store.path(raw["storage_key"]).exists()


def derived_fixture(context):
    from app.modules.preprocessing.models import PreparedArtifact, PreparedFrameSet

    session, settings, svc = context
    view, raw, _ = publish(svc, settings)
    plane = {
        "id": str(uuid4()),
        "view_id": view["id"],
        "sha256": "b" * 64,
        "size_bytes": 10,
        "content_type": "application/fits",
        "kind": "common_grid_planes",
        "source_product_ids": [raw["product_id"]],
        "storage_key": raw["storage_key"].replace(raw["sha256"], "b" * 64),
    }
    meta = {
        "index": 0,
        "product_id": raw["product_id"],
        "raw_artifact_id": raw["id"],
        "detector": "D2",
        "artifact_indices": {"planes": 0},
    }
    report = {
        "version": "frames-v1",
        "frames": [meta],
        "grid": {"header": "test", "shape": [2, 2]},
        "artifacts": [plane],
    }
    session.add(
        PreparedArtifact(
            id=plane["id"], view_id=view["id"], payload=plane, published=True, storage_deleted=False
        )
    )
    session.add(PreparedFrameSet(view_id=view["id"], report=report))
    session.commit()
    return view, raw, report


def test_derived_jobs_share_idempotency_claim_cancellation_and_parent_isolation(context):
    from uuid import UUID

    from app.modules.analyses.derived_service import submit as derived_submit
    from app.modules.coadds.schemas import CoaddRequest

    session, settings, svc = context
    parent, _raw, report = derived_fixture(context)
    query = CoaddRequest(inputs=[{"view_id": parent["id"], "index": 0}], detector="D2")
    key = str(uuid4())
    scope = "c" * 64

    def accept(query=query, key=key):
        return derived_submit(
            svc.repository,
            DiscoveryRepository(session),
            UUID(parent["id"]),
            query,
            "coadd",
            settings,
            PublicTokens(settings),
            scope,
            "d" * 64,
            key,
        )

    first, status = accept()
    assert status == 202
    replay, status = accept()
    assert status == 200 and replay["id"] == first["id"]
    with pytest.raises(GatewayConflict):
        accept(query.model_copy(update={"detector": "D3"}))
    job = claim(svc.repository)
    assert job["kind"] == "coadd" and job["config"]["derived"]["kind"] == "coadd"
    assert job["config"]["sources"][0]["metadata"] == report["frames"][0]
    svc.repository.rpc(
        "view_cancel", {"p_id": first["id"], "p_digest": token_digest(first["cancel_token"])}
    )
    assert svc.repository.rpc("view_get", {"p_id": first["id"]})["status"] == "canceled"
    assert svc.repository.rpc("view_get", {"p_id": parent["id"]})["status"] == "succeeded"
    assert svc.repository.rpc("frame_set_get", {"p_id": parent["id"]}) == report
    with pytest.raises(GatewayConflict):
        svc.repository.rpc("view_heartbeat", {"p_id": first["id"], "p_token": job["lease_token"]})


def test_derived_admission_rejects_forged_source_before_creating_a_job(context):
    from app.modules.views.service import policy

    session, settings, svc = context
    parent, raw, report = derived_fixture(context)
    product = DiscoveryRepository(session).find(product_id=raw["product_id"])
    canonical = {"contract_version": "derived-v1", "kind": "coadd", "primary_view_id": parent["id"]}
    source = {
        "ref": {"view_id": parent["id"], "index": 0},
        "metadata": report["frames"][0],
        "raw": raw,
        "planes": report["artifacts"][0] | {"sha256": "c" * 64},
    }
    config = {
        "derived": canonical,
        "sources": [source],
        "products": [product],
        "limits": policy(settings),
    }
    before = session.scalar(select(func.count()).select_from(ViewSubmission))
    with pytest.raises(GatewayConflict):
        svc.repository.rpc(
            "derived_submit",
            {
                "p_id": str(uuid4()),
                "p_scope": "c" * 64,
                "p_ip": "d" * 64,
                "p_key": "e" * 64,
                "p_hash": "f" * 64,
                "p_digest": "1" * 64,
                "p_canonical": canonical,
                "p_parents": [{"id": parent["id"], "report": report}],
                "p_config": config,
                "p_policy": policy(settings),
            },
        )
    assert session.scalar(select(func.count()).select_from(ViewSubmission)) == before


def test_derived_source_retention_covers_queue_deadline(context):
    from uuid import UUID

    from fastapi import HTTPException

    from app.modules.analyses.derived_service import submit as derived_submit
    from app.modules.coadds.schemas import CoaddRequest

    session, settings, svc = context
    parent, _, _ = derived_fixture(context)
    session.execute(
        text("UPDATE sky_views SET expires_at=now()+interval '5 minutes' WHERE id=:id"),
        {"id": parent["id"]},
    )
    session.commit()
    query = CoaddRequest(inputs=[{"view_id": parent["id"], "index": 0}], detector="D2")
    with pytest.raises(HTTPException) as error:
        derived_submit(
            svc.repository,
            DiscoveryRepository(session),
            UUID(parent["id"]),
            query,
            "coadd",
            settings,
            PublicTokens(settings),
            "c" * 64,
            "d" * 64,
            str(uuid4()),
        )
    assert (
        error.value.status_code == 409
        and error.value.detail["code"] == "source_retention_too_short_resubmit_view"
    )


def test_refresh_lease_cooldown_and_fencing(context):
    _session, _settings, svc = context
    key = hashlib.sha256(str(uuid4()).encode()).hexdigest()
    repository = svc.repository
    receipt = repository.rpc("release_refresh_claim", {"p_hash": key, "p_cooldown": 300})
    assert receipt["claimed"]
    assert not repository.rpc("release_refresh_claim", {"p_hash": key, "p_cooldown": 300})[
        "claimed"
    ]
    with pytest.raises(GatewayConflict):
        repository.rpc(
            "release_refresh_finish",
            {"p_hash": key, "p_token": str(uuid4()), "p_report": {"status": "checked"}},
        )
    repository.rpc(
        "release_refresh_finish",
        {
            "p_hash": key,
            "p_token": receipt["token"],
            "p_report": {"status": "checked", "snapshot_id": str(uuid4())},
        },
    )
    replay = repository.rpc("release_refresh_claim", {"p_hash": key, "p_cooldown": 300})
    assert not replay["claimed"] and replay["payload"]["status"] == "checked"
    assert any(item["query_hash"] == key for item in repository.rpc("release_refresh_status"))


def test_export_uses_shared_job_admission_and_gif_upload_ledger(context):
    from uuid import UUID

    from app.modules.analyses.derived_service import submit as derived_submit
    from app.modules.artifacts.export_router import MovieExportRequest

    session, settings, svc = context
    parent, _, _ = derived_fixture(context)
    query = MovieExportRequest(inputs=[{"view_id": parent["id"], "index": 0}])
    receipt, status = derived_submit(
        svc.repository,
        DiscoveryRepository(session),
        UUID(parent["id"]),
        query,
        "export",
        settings,
        PublicTokens(settings),
        "c" * 64,
        "d" * 64,
        str(uuid4()),
    )
    assert status == 202 and receipt["result_url"] == f"/api/v1/exports/{receipt['id']}"
    job = claim(svc.repository)
    assert job["kind"] == "export"
    file = {
        "id": str(uuid4()),
        "view_id": job["id"],
        "sha256": "a" * 64,
        "size_bytes": 50,
        "content_type": "image/gif",
        "kind": "movie_gif",
        "source_product_ids": [p["id"] for p in job["config"]["products"]],
        "storage_key": f"objects/{job['id']}/{job['lease_token']}/" + "a" * 64 + ".gif",
    }
    assert svc.repository.rpc(
        "prepare_frame_upload", {"p_id": job["id"], "p_token": job["lease_token"], "p_file": file}
    )["prepared"]


def test_explicit_refresh_retry_replays_before_any_discovery(context):
    _session, _settings, svc = context
    key = str(uuid4())
    receipt, status = svc.submit(request(), "a" * 64, "b" * 64, key, refresh=True)
    assert status == 202
    svc.discovery = None
    replay, status = svc.submit(request(), "a" * 64, "b" * 64, key, refresh=True)
    assert status == 200 and replay["id"] == receipt["id"]


def test_admin_refresh_requires_configured_secret_and_records_result(context, monkeypatch):
    from app.modules.views.router import get_view_repository

    _session, settings, svc = context
    settings.refresh_admin_token = __import__("pydantic").SecretStr("local-test-admin-secret-" * 3)
    monkeypatch.setattr("app.modules.releases.router.get_settings", lambda: settings)
    app.dependency_overrides[get_view_repository] = lambda: svc.repository
    app.dependency_overrides[get_discovery_service] = lambda: svc.discovery
    try:
        with TestClient(app) as client:
            query = request().discovery().model_dump(mode="json")
            assert client.post("/api/v1/releases/refresh", json=query).status_code == 403
            assert (
                client.post(
                    "/api/v1/releases/refresh",
                    json=query,
                    headers={"Authorization": "Bearer wrong"},
                ).status_code
                == 403
            )
            response = client.post(
                "/api/v1/releases/refresh",
                json=query,
                headers={
                    "Authorization": "Bearer " + settings.refresh_admin_token.get_secret_value()
                },
            )
            assert response.status_code == 200 and response.json()["status"] in {
                "checked",
                "cooldown",
            }
    finally:
        app.dependency_overrides.clear()
