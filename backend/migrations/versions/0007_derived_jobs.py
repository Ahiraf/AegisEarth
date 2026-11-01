"""Derived operations reuse the shared transactional quotas, jobs and upload ledger."""

from pathlib import Path

from alembic import op

from app.modules.analyses import derived_service
from app.modules.preprocessing import models

revision = "cosmic_0007"
down_revision = "cosmic_0006"
branch_labels = None
depends_on = None


def upload_sql():
    sql = Path(models.__file__).with_name("gateway.sql").read_text(encoding="utf-8")
    return sql[: sql.index("CREATE FUNCTION gateway.frame_set_get")].replace(
        "CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"
    )


def upgrade():
    if op.get_bind().dialect.name != "postgresql":
        return
    sql = upload_sql().replace(
        "WHEN 'application/json' THEN 'json' ELSE NULL END;",
        "WHEN 'application/json' THEN 'json' WHEN 'text/csv' THEN 'csv' ELSE NULL END;",
    )
    sql = sql.replace(
        "'stage','frames_prepared',",
        "'stage',CASE WHEN job.kind='view' THEN 'frames_prepared' ELSE 'derived_ready' END,",
    )
    op.execute(sql)
    op.execute(
        Path(derived_service.__file__).with_name("derived_gateway.sql").read_text(encoding="utf-8")
    )


def downgrade():
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(
        "DROP FUNCTION gateway.derived_submit(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb)"
    )
    op.execute(upload_sql())
    from app.modules.views import movie_models

    sql = Path(movie_models.__file__).with_name("movie_gateway.sql").read_text(encoding="utf-8")
    op.execute(sql[sql.index("CREATE OR REPLACE FUNCTION gateway.readiness()") :])
