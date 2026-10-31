import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.database import get_db
from app.core.gateway import GatewayError, GatewayRepository
from app.main import app
from app.modules.observations.feasibility import flag_definitions
from app.modules.targets.catalog import load_targets


def test_five_verified_target_presets_and_epoch_aware_search_seed():
    targets = load_targets()
    assert len(targets) == 5
    wise = next(target for target in targets if target.slug == "wise-0855")
    assert wise.supplied_coordinate["reference_epoch"] is None
    assert wise.search_position("2026-01-01T00:00:00")["ra_deg"] < wise.ra_deg
    with TestClient(app) as client:
        result = client.get("/api/v1/targets")
    assert result.status_code == 200 and result.json()["total"] == 5
    assert "not_live_discovery" in result.json()["status"]


def test_qr3_masks_are_weights_not_bit_indices():
    assert flag_definitions({"MSKN0021": "SOURCE", "MSKM0021": 2097152}) == {"MP_SOURCE": 21}
    with pytest.raises(ValueError, match="exactly one bit"):
        flag_definitions({"MSKN0021": "SOURCE", "MSKM0021": 3})


def test_gateway_refuses_cleartext_and_unknown_rpc():
    with pytest.raises(ValueError, match="HTTPS"):
        GatewayRepository(
            Settings(_env_file=None, gateway_url="http://example.test", gateway_token="secret")
        )
    gateway = GatewayRepository(
        Settings(_env_file=None, gateway_url="https://example.test", gateway_token="secret"),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(307, headers={"Location": "https://evil.test"})
        ),
    )
    try:
        with pytest.raises(ValueError, match="Unapproved"):
            gateway.rpc("arbitrary_sql")
        with pytest.raises(GatewayError, match="unavailable"):
            gateway.rpc("readiness")
    finally:
        gateway.close()


def test_gateway_rejects_invalid_json_without_forwarding_upstream_details():
    gateway = GatewayRepository(
        Settings(_env_file=None, gateway_url="https://example.test", gateway_token="secret"),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, content=b"PRIVATE_INVALID_JSON")
        ),
    )
    try:
        with pytest.raises(GatewayError, match=r"^gateway_unavailable$"):
            gateway.rpc("readiness")
    finally:
        gateway.close()


def test_gateway_readiness_uses_selected_transport_without_native_queries(monkeypatch):
    from app.modules.health import router as health

    class NativeMustNotRun:
        def execute(self, statement):
            raise AssertionError("Gateway mode must not run native SQL")

    class HealthyGateway:
        def rpc(self, method):
            return {"status": "ready", "schema_revision": "cosmic_0005"}

        def close(self):
            pass

    monkeypatch.setattr(
        health, "get_settings", lambda: Settings(_env_file=None, database_transport="postgrest")
    )
    monkeypatch.setattr(health, "GatewayRepository", lambda settings: HealthyGateway())
    app.dependency_overrides[get_db] = lambda: NativeMustNotRun()
    try:
        with TestClient(app) as client:
            assert client.get("/api/v1/health/ready").status_code == 200
    finally:
        app.dependency_overrides.clear()
