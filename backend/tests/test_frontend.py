from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.frontend import mount_frontend


def test_spa_fallback_preserves_api_and_missing_asset_errors(tmp_path):
    (tmp_path / "index.html").write_text("<h1>AegisEarth</h1>", encoding="utf-8")
    app = FastAPI()
    mount_frontend(app, str(tmp_path))
    with TestClient(app) as client:
        assert "AegisEarth" in client.get("/learn/orbits").text
        assert client.get("/api/v1/unknown").status_code == 404
        assert client.get("/assets/missing.js").status_code == 404
