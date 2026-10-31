from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import get_db
from app.main import app


def test_liveness_and_pipeline_transparency():
    with TestClient(app) as client:
        assert client.get("/api/v1/health/live").json() == {"status": "ok"}
        capabilities = client.get("/api/v1/system/capabilities").json()
        assert capabilities["service"] == "Cosmic Motion AI"
        assert capabilities["pipeline"]["execution_available"] is False
        assert len(capabilities["pipeline"]["stages"]) == 11
        assert client.get("/api/v1/neos").status_code == 404


def test_analysis_contract_and_unimplemented_execution():
    request = {"observation_ids": ["obs-a", "obs-b"], "center_ra_deg": 120, "center_dec_deg": -30}
    with TestClient(app) as client:
        response = client.post("/api/v1/analyses", json=request)
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "feature_not_ready"
        request["observation_ids"] = ["obs-a", "obs-a"]
        assert client.post("/api/v1/analyses", json=request).status_code == 422


def test_openapi_exposes_new_scope_only():
    schema = app.openapi()
    assert schema["info"]["title"] == "Cosmic Motion AI API"
    assert "/api/v1/observations/search" in schema["paths"]
    assert "/api/v1/analyses" in schema["paths"]
    assert "/api/v1/neos" not in schema["paths"]


def test_legacy_discovery_explicitly_retired():
    query = {
        "region": {"ra_deg": 12, "dec_deg": -20, "radius_deg": 0.01},
        "start_at": "2025-05-01T00:00:00Z",
        "end_at": "2025-06-01T00:00:00Z",
    }
    with TestClient(app) as client:
        response = client.post("/api/v1/observations/search", json=query)
        assert response.status_code == 410
        assert "items" not in response.json()


def test_readiness_dependency_failure_is_sanitized():
    class UnavailableDatabase:
        def execute(self, query):
            raise SQLAlchemyError("PRIVATE_CONNECTION_TEST")

    def unavailable_db():
        yield UnavailableDatabase()

    app.dependency_overrides[get_db] = unavailable_db
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/health/ready")
            assert response.status_code == 503
            assert response.json() == {"status": "not_ready"}
            assert "PRIVATE_CONNECTION_TEST" not in response.text
    finally:
        app.dependency_overrides.clear()
