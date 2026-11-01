"""Refresh leases and captioned export publication; existing views and artifacts are preserved."""

from pathlib import Path

from alembic import op

from app.modules.releases.models import RefreshCheck

revision = "cosmic_0008"
down_revision = "cosmic_0007"
branch_labels = None
depends_on = None


def upgrade():
    RefreshCheck.__table__.create(op.get_bind())
    if op.get_bind().dialect.name != "postgresql":
        return
    from app.modules.analyses import derived_service
    from app.modules.preprocessing import models
    from app.modules.releases import refresh

    sql = Path(models.__file__).with_name("gateway.sql").read_text()
    sql = sql[: sql.index("CREATE FUNCTION gateway.frame_set_get")].replace(
        "CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"
    )
    sql = sql.replace(
        "WHEN 'application/json' THEN 'json' ELSE NULL END;",
        "WHEN 'application/json' THEN 'json' WHEN 'text/csv' THEN 'csv' WHEN 'image/gif' THEN 'gif' ELSE NULL END;",
    )
    sql = sql.replace(
        "'stage','frames_prepared',",
        "'stage',CASE WHEN job.kind='view' THEN 'frames_prepared' ELSE 'derived_ready' END,",
    )
    op.execute(sql)
    sql = (
        Path(derived_service.__file__)
        .with_name("derived_gateway.sql")
        .read_text()
        .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
    )
    sql = sql.replace(
        "('coadd','difference','spectrum')", "('coadd','difference','spectrum','export')"
    ).replace("cosmic_0007", "cosmic_0008")
    op.execute(sql)
    op.execute(Path(refresh.__file__).with_name("gateway.sql").read_text())


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        for signature in [
            "release_refresh_claim(text,int)",
            "release_refresh_finish(text,text,jsonb)",
            "release_refresh_status()",
        ]:
            op.execute("DROP FUNCTION gateway." + signature)
        from app.modules.analyses import derived_service
        from app.modules.preprocessing import models

        sql = Path(models.__file__).with_name("gateway.sql").read_text()
        sql = sql[: sql.index("CREATE FUNCTION gateway.frame_set_get")].replace(
            "CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"
        )
        sql = sql.replace(
            "WHEN 'application/json' THEN 'json' ELSE NULL END;",
            "WHEN 'application/json' THEN 'json' WHEN 'text/csv' THEN 'csv' ELSE NULL END;",
        )
        sql = sql.replace(
            "'stage','frames_prepared',",
            "'stage',CASE WHEN job.kind='view' THEN 'frames_prepared' ELSE 'derived_ready' END,",
        )
        op.execute(sql)
        op.execute(
            Path(derived_service.__file__)
            .with_name("derived_gateway.sql")
            .read_text()
            .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
        )
    RefreshCheck.__table__.drop(op.get_bind())
