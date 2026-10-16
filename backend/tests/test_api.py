from fastapi.testclient import TestClient

from app.main import app


def test_liveness():
    with TestClient(app) as client:
        assert client.get("/api/v1/health/live").json() == {"status": "ok"}


def test_openapi_contract():
    schema = app.openapi()
    assert "/api/v1/neos" in schema["paths"]
    assert "/api/v1/neos/{object_id}" in schema["paths"]
