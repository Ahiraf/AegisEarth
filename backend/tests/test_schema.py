import os

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_migration_roundtrip(tmp_path):
    # CI uses real PostgreSQL; the local fallback exercises the same migration in SQLite.
    database_url = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'migration.sqlite'}")
    from app.core.config import get_settings

    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    get_settings.cache_clear()
    try:
        config = Config("alembic.ini")
        command.upgrade(config, "head")
        command.check(config)
        engine = create_engine(database_url)
        assert {
            "observations",
            "analysis_runs",
            "analysis_inputs",
            "stage_executions",
            "model_versions",
            "candidates",
            "artifacts",
            "processing_jobs",
            "source_products",
            "discovery_snapshots",
            "sky_views",
            "view_submissions",
            "view_input_pins",
            "view_files",
            "prepared_frame_sets",
            "prepared_artifacts",
        } <= set(inspect(engine).get_table_names())
        assert "neo_objects" not in inspect(engine).get_table_names()
        command.downgrade(config, "base")
        engine.dispose()
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
        get_settings.cache_clear()
