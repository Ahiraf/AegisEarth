"""Processing-job persistence and restricted PostgREST functions; execution stays disabled."""

from pathlib import Path

from alembic import op

from app.modules.analyses.jobs import ProcessingJob

revision = "cosmic_0002"
down_revision = "cosmic_0001"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    ProcessingJob.__table__.create(bind)
    if bind.dialect.name == "postgresql":
        sql = Path(__file__).resolve().parents[2] / "app/modules/analyses/gateway.sql"
        # SQL is packaged with app; migration directories may sit beside app in Docker.
        if not sql.exists():
            from app.modules.analyses import jobs

            sql = Path(jobs.__file__).with_name("gateway.sql")
        op.execute(sql.read_text(encoding="utf-8"))


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for signature in (
            "cancel_job(text,text)",
            "finish_job(text,text,text,jsonb)",
            "heartbeat_job(text,text,integer)",
            "claim_job(text,integer)",
            "enqueue_job(text,text,text,text,jsonb)",
            "readiness()",
        ):
            op.execute("DROP FUNCTION gateway." + signature)
        op.execute("DROP SCHEMA gateway")
    ProcessingJob.__table__.drop(bind)
