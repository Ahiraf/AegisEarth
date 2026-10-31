"""Durable anonymous input acquisition, quota admission and fenced publication."""

from pathlib import Path

from alembic import op

from app.modules.views import models

revision = "cosmic_0004"
down_revision = "cosmic_0003"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    for model in (models.SkyView, models.ViewSubmission, models.ViewInputPin, models.ViewFile):
        model.__table__.create(bind)
    if bind.dialect.name == "postgresql":
        op.execute(Path(models.__file__).with_name("gateway.sql").read_text())


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for signature in (
            "fail_view(text,text,text,boolean)",
            "complete_view(text,text,jsonb)",
            "view_pin(text,text,text,text)",
            "view_prepare_upload(text,text,jsonb)",
            "view_heartbeat(text,text)",
            "claim_view_job(text,integer)",
            "view_artifact(text)",
            "view_cancel(text,text)",
            "view_submit(text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb)",
            "view_get(text)",
            "view_replay(text,text,text)",
            "view_preflight(text,text,jsonb)",
        ):
            op.execute("DROP FUNCTION gateway." + signature)
        from app.modules.observations import discovery_models

        sql = Path(discovery_models.__file__).with_name("discovery_gateway.sql").read_text()
        op.execute(sql[sql.index("CREATE OR REPLACE FUNCTION gateway.readiness()") :])
    for model in (models.ViewFile, models.ViewInputPin, models.ViewSubmission, models.SkyView):
        model.__table__.drop(bind)
