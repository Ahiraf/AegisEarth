"""Candidate-centred ranker cutouts; leave viewer acquisition functions unchanged."""

from pathlib import Path

from alembic import op

from app.modules.ranking import package

revision = "cosmic_0010"
down_revision = "cosmic_0009"
branch_labels = None
depends_on = None


def completion_sql():
    original = Path(package.__file__).with_name("gateway.sql").read_text()
    start = original.index("CREATE FUNCTION gateway.ranker_complete(")
    end = original.index("CREATE FUNCTION gateway.ranker_get(")
    return original[start:end].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)


def upgrade():
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(Path(package.__file__).with_name("candidate_cutouts.sql").read_text())
    sql = (
        completion_sql()
        .replace(
            "OR jsonb_array_length(p_report->'candidates')>32 OR octet_length(p_report::text)>256000",
            "OR octet_length(p_report::text)>4000000",
        )
        .replace(
            "PERFORM gateway.complete_view(p_id,p_token,p_files);",
            """
    IF job.config->'ranker'->>'cutout_policy'='per_candidate_centered_v1' THEN
      IF p_report->>'cutout_policy' IS DISTINCT FROM 'per_candidate_centered_v1'
      OR (p_report->'acquisition'->>'input_count')::int IS DISTINCT FROM jsonb_array_length(p_files) THEN
        RAISE SQLSTATE 'PT422' USING MESSAGE='ranker_input_count_mismatch';
      END IF;
      PERFORM gateway.ranker_publish_inputs(p_id,p_token,p_files);
    ELSE
      PERFORM gateway.complete_view(p_id,p_token,p_files);
    END IF;
    """,
        )
    )
    op.execute(sql)
    op.execute("""
      CREATE OR REPLACE FUNCTION gateway.readiness() RETURNS jsonb
      LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
        SELECT jsonb_build_object('status','ready','schema_revision',version_num)
        FROM public.alembic_version WHERE version_num IN ('cosmic_0009','cosmic_0010');
      $$;
    """)


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute(completion_sql())
        op.execute("DROP FUNCTION gateway.ranker_prepare_cutout(text,text,jsonb,jsonb)")
        op.execute("DROP FUNCTION gateway.ranker_publish_inputs(text,text,jsonb)")
