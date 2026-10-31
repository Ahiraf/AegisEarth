"""Versioned prepared frames and transactional derived-artifact publication."""

from pathlib import Path

from alembic import op

from app.modules.preprocessing import models

revision = "cosmic_0005"
down_revision = "cosmic_0004"
branch_labels = None
depends_on = None


def preceding_sql():
    from app.modules.views import models as views

    return Path(views.__file__).with_name("gateway.sql").read_text(encoding="utf-8")


def section(sql, name, next_name):
    start = sql.index("CREATE FUNCTION gateway." + name)
    return sql[start : sql.index("CREATE FUNCTION gateway." + next_name, start)].replace(
        "CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1
    )


def upgrade():
    bind = op.get_bind()
    models.PreparedFrameSet.__table__.create(bind)
    models.PreparedArtifact.__table__.create(bind)
    if bind.dialect.name == "postgresql":
        submit = section(preceding_sql(), "view_submit(", "view_cancel(")
        submit = submit.replace(
            "'region',p_canonical->'region','limits',p_policy)",
            "'region',p_canonical->'region','limits',p_policy,'preparation',p_canonical->'preparation')",
        )
        op.execute(submit)
        op.execute(Path(models.__file__).with_name("gateway.sql").read_text(encoding="utf-8"))


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for signature in (
            "frame_set_get(text)",
            "complete_prepared_view(text,text,jsonb,jsonb,jsonb)",
            "prepare_frame_upload(text,text,jsonb)",
        ):
            op.execute("DROP FUNCTION gateway." + signature)
        sql = preceding_sql()
        op.execute(section(sql, "view_submit(", "view_cancel("))
        op.execute(section(sql, "view_artifact(", "claim_view_job("))
        op.execute(sql[sql.index("CREATE OR REPLACE FUNCTION gateway.readiness()") :])
    models.PreparedArtifact.__table__.drop(bind)
    models.PreparedFrameSet.__table__.drop(bind)
