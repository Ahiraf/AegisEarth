import copy
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

import httpx
import numpy as np
import pytest
from astropy.coordinates import SkyCoord
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import Base
from app.main import app
from app.modules.observations.discovery import DiscoveryService, deduplicate, footprint_intersects
from app.modules.observations.discovery_models import DiscoverySnapshot, SourceProduct
from app.modules.observations.provider import MAX_BYTES, ProviderError, SIAProvider, parse_response
from app.modules.observations.repository import DiscoveryRepository
from app.modules.observations.router import get_discovery_service
from app.modules.observations.schemas import DiscoverySearch
from app.modules.targets.coordinates import Coordinates, RectangularRegion

FIXTURE = Path(__file__).parent / "fixtures/observations/m101_qr2.xml"
NS = {"v": "http://www.ivoa.net/xml/VOTable/v1.3"}


def votable(*, count=3, status="OK", rename=None):
    root = ET.fromstring(FIXTURE.read_bytes())
    resource = root.find("v:RESOURCE[@type='results']", NS)
    data = resource.find("v:TABLE/v:DATA/v:TABLEDATA", NS)
    for row in list(data)[count:]:
        data.remove(row)
    resource.find("v:INFO[@name='QUERY_STATUS']", NS).set("value", status)
    if rename:
        resource.find(f"v:TABLE/v:FIELD[@name='{rename}']", NS).set("name", "changed")
    return ET.tostring(root)


def request(**changes):
    data = {
        "contract_version": "discovery-v1",
        "region": {"ra": 210.8023, "dec": 54.3489},
        "collections": ["spherex_qr2"],
        "limit": 1,
    }
    data.update(changes)
    return DiscoverySearch(**data)


@pytest.mark.parametrize(
    ("ra", "dec", "unit", "expected"),
    [
        (360, -90, None, 0),
        (-1, 90, None, 359),
        (8.5, -7, "hourangle", 127.5),
        ("08:55:10.831", "-07:14:42.53", None, 133.7951291667),
        ("08h55m10.831s", "-07d14m42.53s", "hourangle", 133.7951291667),
        ("133.5", "-0:30:00", None, 133.5),
    ],
)
def test_coordinate_units_wrap_and_negative_dec(ra, dec, unit, expected):
    result = Coordinates(ra=ra, dec=dec, ra_unit=unit).normalized()
    assert result["ra_deg"] == pytest.approx(expected)
    if dec == "-0:30:00":
        assert result["dec_deg"] == -0.5


@pytest.mark.parametrize(
    "changes",
    [
        {"ra": "08:30:00", "ra_unit": "deg"},
        {"ra": float("inf")},
        {"dec": -90.1},
        {"ra": "08:99:00"},
        {"dec": "nonsense"},
        {"frame": "fk5"},
        {"ra_unit": "radians"},
        {"ra": True},
    ],
)
def test_invalid_coordinates(changes):
    with pytest.raises(ValidationError):
        Coordinates(**({"ra": 12, "dec": -20} | changes))


@pytest.mark.parametrize(("ra", "dec"), [(359.999, 0), (0, 90), (12, -90), (12, -89.999)])
def test_full_rectangle_corners_inside_provider_cap(ra, dec):
    geometry = RectangularRegion(ra=ra, dec=dec, width_arcmin=30, height_arcmin=20).geometry()
    center = SkyCoord(ra, dec, unit="deg")
    corners = SkyCoord(np.array(geometry["corners_icrs_deg"]), unit="deg")
    assert all(center.separation(corners).degree <= geometry["search_radius_deg"])
    assert geometry["search_radius_deg"] > 30 / 120


@pytest.mark.parametrize(
    "changes",
    [
        {"start_at": "2026-01-01T00:00:00Z"},
        {"wavelength_min_um": 3},
        {"wavelength_min_um": 4, "wavelength_max_um": 3},
        {"collections": ["unknown"]},
        {"detectors": ["D1", "D1"]},
        {"region": {"ra": 1, "dec": 0, "width_arcmin": 31}},
    ],
)
def test_discovery_limits(changes):
    with pytest.raises(ValidationError):
        request(**changes)


def test_votable_names_not_ids_empty_status_schema_and_units():
    rows, truncated = parse_response(votable(), "spherex_qr2")
    assert len(rows) == 3 and not truncated
    assert rows[0]["local_wavelength_um"] is None
    assert rows[0]["calibration_version"].startswith("l2b-v")
    assert parse_response(votable(count=0), "spherex_qr2") == ([], False)
    assert parse_response(votable(status="OVERFLOW"), "spherex_qr2")[1]
    assert parse_response(votable(), "spherex_qr2", with_status=True)[2] == ["OK"]
    for body in [
        votable(status="ERROR"),
        votable(rename="obs_id"),
        b"<bad>",
        votable().replace(b'unit="m"', b'unit="um"'),
        b"<!DOCTYPE x>" + votable(),
    ]:
        with pytest.raises(ProviderError):
            parse_response(body, "spherex_qr2")


def test_recorded_qr3_product_schema():
    rows, _ = parse_response(FIXTURE.with_name("qr3_one.xml").read_bytes(), "spherex_qr3")
    assert len(rows) == 1 and rows[0]["release"] == "qr3"
    assert "/spherex/qr3/level2/" in rows[0]["access_url"]
    assert rows[0]["provider_id"].startswith("ivo://irsa.ipac/spherex_qr3?")


def test_safe_links_identity_and_document_budgets():
    for body in [
        votable().replace(b"https://irsa.ipac.caltech.edu/ibe/", b"https://evil.test/ibe/"),
        votable().replace(b"ivo://irsa.ipac/", b"ivo://another/"),
        b"x" * (MAX_BYTES + 1),
    ]:
        with pytest.raises(ProviderError):
            parse_response(body, "spherex_qr2")


def test_http_backoff_timeout_redirect_and_retry_budget():
    calls = []

    def handler(req):
        calls.append(req)
        return httpx.Response(503) if len(calls) == 1 else httpx.Response(200, content=votable())

    provider = SIAProvider(
        Settings(_env_file=None), transport=httpx.MockTransport(handler), sleep=lambda _: None
    )
    _, receipt = provider.search("spherex_qr2", {"POS": "CIRCLE 1 2 0.1"})
    assert receipt["attempts"] == 2
    assert calls[0].url.params["MAXREC"] == "40"

    def timeout(req):
        raise httpx.ReadTimeout("PRIVATE", request=req)

    for handler in [
        timeout,
        lambda _: httpx.Response(302, headers={"Location": "https://evil.test"}),
    ]:
        provider = SIAProvider(
            Settings(_env_file=None), transport=httpx.MockTransport(handler), sleep=lambda _: None
        )
        with pytest.raises(ProviderError, match=r"^provider_unavailable$"):
            provider.search("spherex_qr2", {})


def test_corner_only_intersection_wrap_and_no_overlap():
    geometry = RectangularRegion(ra=0, dec=0, width_arcmin=12, height_arcmin=12).geometry()
    # Footprint touches only a corner of the rectangle, not its center/inscribed circle.
    assert footprint_intersects(
        {"footprint_icrs": "POLYGON ICRS 0.09 0.09 0.12 0.09 0.12 0.12 0.09 0.12"}, geometry
    )
    assert footprint_intersects(
        {"footprint_icrs": "POLYGON ICRS 359.99 -0.01 0.01 -0.01 0.01 0.01 359.99 0.01"}, geometry
    )
    assert not footprint_intersects(
        {"footprint_icrs": "POLYGON ICRS 0.2 0.2 0.3 0.2 0.3 0.3 0.2 0.3"}, geometry
    )


def test_reprocessed_dedup_retains_versions_and_detector_identity():
    original = parse_response(votable(count=1), "spherex_qr2")[0][0]
    newer = {**original, "id": "f" * 64, "collection": "spherex_qr3", "release": "qr3"}
    selected = deduplicate([original, newer, original])
    assert len(selected) == 1 and selected[0]["id"] == newer["id"]
    assert selected[0]["alternate_product_ids"] == [original["id"]]
    other_detector = {**original, "id": "e" * 64, "exposure_key": original["exposure_key"] + ":D6"}
    assert len(deduplicate([original, other_detector])) == 2


@pytest.fixture
def service(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'discovery.sqlite'}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    session = Session(engine)
    provider = SIAProvider(
        Settings(_env_file=None),
        transport=httpx.MockTransport(lambda _: httpx.Response(200, content=votable())),
        sleep=lambda _: None,
    )
    service = DiscoveryService(DiscoveryRepository(session), provider)
    yield service
    session.close()
    engine.dispose()


def test_cache_pagination_revalidation_and_immutable_products(service):
    first = service.search(request())
    assert first["sampled_count"] == 3 and first["next_page"]
    assert not first["cache_hit"]
    assert first["items"][0]["start_at_utc"] <= first["items"][-1]["start_at_utc"]
    cached = service.search(request(limit=2))
    assert cached["snapshot_id"] == first["snapshot_id"] and cached["cache_hit"]
    frozen = copy.deepcopy(service.repository.find(snapshot_id=first["snapshot_id"]))
    service.now = lambda: datetime.fromisoformat(first["created_at_utc"]) + timedelta(hours=1)
    fresh = service.search(request())
    assert fresh["snapshot_id"] != first["snapshot_id"]
    assert service.repository.find(snapshot_id=first["snapshot_id"]) == frozen
    assert service.page(frozen, 1, 1)["stale"]
    db = service.repository.db
    assert db.scalar(select(func.count()).select_from(SourceProduct)) == 3
    assert db.scalar(select(func.count()).select_from(DiscoverySnapshot)) == 2


def test_explicit_refresh_observes_new_data_preserves_frozen_snapshot(service):
    service.ttl_seconds = 1800
    original = service.search(request())
    frozen = copy.deepcopy(service.repository.find(snapshot_id=original["snapshot_id"]))
    old = service.provider

    class NewProvider:
        def search(self, collection, params):
            rows, receipt = old.search(collection, params)
            added = copy.deepcopy(rows[0])
            added["id"] = "c" * 64
            added["exposure_key"] += "-new"
            return [*rows, added], receipt

    service.provider = NewProvider()
    assert service.search(request())["sampled_count"] == 3
    new = service.search(request(), force=True)
    assert new["sampled_count"] == 4 and new["snapshot_id"] != original["snapshot_id"]
    assert service.repository.find(snapshot_id=original["snapshot_id"]) == frozen
    assert (
        datetime.fromisoformat(new["revalidate_after_utc"])
        - datetime.fromisoformat(new["created_at_utc"])
    ).total_seconds() == 1800


def test_empty_partial_and_total_failure_not_confused(service):
    class PartialProvider:
        def search(self, collection, params):
            if collection == "spherex_qr2":
                raise ProviderError("provider_unavailable")
            return [], {"collection": collection, "status": "OK", "truncated": False}

    service.provider = PartialProvider()
    partial = service.search(request(collections=["spherex_qr2", "spherex_qr3"]))
    assert partial["total"] is None and not partial["upstream_complete"]
    assert partial["availability"]["outcome"] == "incomplete"
    empty = service.search(request(collections=["spherex_qr3"]))
    assert empty["total"] == 0 and empty["availability"]["outcome"] == "no_data"
    with pytest.raises(ProviderError, match="all_sources_unavailable"):
        service.search(request())


def test_api_real_repository_handoff_and_provider_outage(service):
    app.dependency_overrides[get_discovery_service] = lambda: service
    try:
        with TestClient(app) as client:
            assert client.post(
                "/api/v1/targets/resolve", json={"ra": "08:30:00", "dec": -7}
            ).json()["ra_deg"] == pytest.approx(127.5)
            assert len(client.get("/api/v1/releases").json()["items"]) == 4
            result = client.post(
                "/api/v1/observations/search", json=request().model_dump(mode="json")
            )
            assert result.status_code == 200, result.text
            data = result.json()
            assert client.get(data["next_page"]).json()["offset"] == 1
            product = client.get("/api/v1/observations/" + data["items"][0]["id"])
            assert "source_metadata" in product.json()
            assert (
                client.get(
                    "/api/v1/observations/snapshots/00000000-0000-0000-0000-000000000000"
                ).status_code
                == 404
            )
            assert (
                client.post(
                    "/api/v1/observations/search",
                    json={"contract_version": "discovery-v1", "region": {"ra": 1, "dec": 91}},
                ).status_code
                == 422
            )
    finally:
        app.dependency_overrides.clear()


def test_expired_cache_outage_preserves_old_snapshot_and_reports_503(service):
    first = service.search(request())
    service.now = lambda: datetime.fromisoformat(first["created_at_utc"]) + timedelta(hours=1)

    class Outage:
        def search(self, collection, params):
            raise ProviderError("provider_unavailable")

    service.provider = Outage()
    app.dependency_overrides[get_discovery_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/observations/search", json=request().model_dump(mode="json")
            )
            assert response.status_code == 503 and "items" not in response.json()
            old = client.get(f"/api/v1/observations/snapshots/{first['snapshot_id']}").json()
            assert old["stale"] and old["sampled_count"] == 3
    finally:
        app.dependency_overrides.clear()


def test_api_concurrency_limit_and_snapshot_bounds(service):
    from app.modules.observations.discovery import SEARCH_SLOTS

    SEARCH_SLOTS.acquire()
    SEARCH_SLOTS.acquire()
    app.dependency_overrides[get_discovery_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/observations/search", json=request().model_dump(mode="json")
            )
            assert response.status_code == 429 and response.headers["Retry-After"] == "5"
    finally:
        SEARCH_SLOTS.release()
        SEARCH_SLOTS.release()
        app.dependency_overrides.clear()


def test_immutable_product_conflict_rolls_back(service):
    result = service.search(request())
    original = service.repository.find(product_id=result["items"][0]["id"])
    snapshot = copy.deepcopy(service.repository.find(snapshot_id=result["snapshot_id"]))
    with pytest.raises(ValueError, match="Immutable product conflict"):
        service.repository.save(snapshot, [{**original, "detector": "D6"}])
    service.repository.db.rollback()
    assert service.repository.find(product_id=original["id"]) == original


def test_time_band_detector_filters_are_sent_and_rechecked(service):
    calls = []

    def handler(req):
        calls.append(req)
        return httpx.Response(200, content=votable())

    service.provider = SIAProvider(Settings(_env_file=None), transport=httpx.MockTransport(handler))
    first = service.search(request(detectors=["D2"], wavelength_min_um=1.2, wavelength_max_um=1.6))
    assert first["sampled_count"] == 1
    assert all(p["detector"] == "D2" for p in first["items"])
    assert [float(v) for v in calls[0].url.params["BAND"].split()] == [1.2e-6, 1.6e-6]
    assert "TIME" not in calls[0].url.params
    empty = service.search(
        request(start_at="2026-01-01T06:00:00+06:00", end_at="2026-01-02T00:00:00Z")
    )
    # Mock provider intentionally ignores TIME; backend still excludes out-of-window fixture rows.
    assert empty["sampled_count"] == 0
    assert "TIME" in calls[-1].url.params
    assert empty["canonical_query"]["start_at"] == "2026-01-01T00:00:00+00:00"


def test_post_table_error_and_exact_cap_never_claim_complete():
    root = ET.fromstring(votable())
    resource = root.find("v:RESOURCE[@type='results']", NS)
    ET.SubElement(
        resource,
        "{http://www.ivoa.net/xml/VOTable/v1.3}INFO",
        {"name": "QUERY_STATUS", "value": "ERROR"},
    )
    with pytest.raises(ProviderError, match="provider_query_failed"):
        parse_response(ET.tostring(root), "spherex_qr2")
    root = ET.fromstring(votable(count=1))
    data = root.find("v:RESOURCE[@type='results']/v:TABLE/v:DATA/v:TABLEDATA", NS)
    for _ in range(39):
        data.append(copy.deepcopy(data[0]))
    assert parse_response(ET.tostring(root), "spherex_qr2")[1]
