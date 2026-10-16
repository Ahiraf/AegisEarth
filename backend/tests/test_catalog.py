import os
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app
from app.modules.catalog.models import NeoObject


@pytest.fixture
def client():
    # CI sets DATABASE_URL to migrated PostgreSQL. Local tests can run without Docker.
    url = os.environ.get("DATABASE_URL", "sqlite://")
    options = {"poolclass": StaticPool, "connect_args": {"check_same_thread": False}} if url == "sqlite://" else {}
    engine = create_engine(url, **options)
    if url == "sqlite://":
        Base.metadata.create_all(engine)
    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(connection, join_transaction_mode="create_savepoint") as session:
            session.add(NeoObject(
                id="fixture-1", name="Synthetic test fixture", object_type="asteroid",
                source_url="https://example.com/test-fixture",
                retrieved_at=datetime.now(UTC),
            ))
            session.flush()

            def override_db():
                yield session

            app.dependency_overrides[get_db] = override_db
            try:
                with TestClient(app) as test_client:
                    yield test_client
            finally:
                app.dependency_overrides.clear()
        transaction.rollback()
    engine.dispose()


def test_catalog_filters_and_detail(client):
    response = client.get("/api/v1/neos?object_type=asteroid")
    assert response.status_code == 200
    assert any(row["id"] == "fixture-1" for row in response.json()["items"])
    assert client.get("/api/v1/neos/fixture-1").json()["diameter_min_km"] is None
    assert client.get("/api/v1/neos/missing").status_code == 404
    assert client.get("/api/v1/neos?object_type=comet").json()["items"] == []


def test_catalog_validation_and_readiness(client):
    assert client.get("/api/v1/neos?limit=101").status_code == 422
    assert client.get("/api/v1/neos?offset=-1").status_code == 422
    assert client.get("/api/v1/neos?object_type=planet").status_code == 422
    assert client.get("/api/v1/health/ready").status_code == 200
