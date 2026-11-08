"""Optional native-FITS metadata ranker, with fenced candidate publication."""

from pathlib import Path

import sqlalchemy as sa
from alembic import op

from app.modules.ranking import package

revision = "cosmic_0009"
down_revision = "cosmic_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("candidates", sa.Column("score_uncertainty", sa.Float(), nullable=True))
    op.add_column("candidates", sa.Column("warnings", sa.JSON(), nullable=True))
    with op.batch_alter_table("candidates") as batch:
        batch.create_check_constraint(
            "ck_candidate_score_uncertainty", "score_uncertainty >= 0 AND score_uncertainty <= 1"
        )
    if op.get_bind().dialect.name == "postgresql":
        op.execute(Path(package.__file__).with_name("gateway.sql").read_text())
        op.execute("""
        CREATE OR REPLACE FUNCTION gateway.readiness() RETURNS jsonb
        LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
        DECLARE revision text;
        BEGIN
          SELECT version_num INTO revision FROM public.alembic_version;
          IF revision NOT IN ('cosmic_0008','cosmic_0009') THEN
            RAISE EXCEPTION 'schema_not_ready';
          END IF;
          RETURN jsonb_build_object('status','ready','schema_revision',revision);
        END $$;
        """)


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        for signature in (
            "ranker_get(text)",
            "ranker_cutout_lookup(text,text)",
            "ranker_complete(text,text,jsonb,jsonb)",
            "ranker_submit(text,text,text,text,text,text,text,jsonb,jsonb,jsonb)",
        ):
            op.execute("DROP FUNCTION gateway." + signature)
    with op.batch_alter_table("candidates") as batch:
        batch.drop_constraint("ck_candidate_score_uncertainty", type_="check")
    op.drop_column("candidates", "warnings")
    op.drop_column("candidates", "score_uncertainty")
