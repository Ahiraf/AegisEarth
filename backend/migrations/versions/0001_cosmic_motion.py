"""Cosmic Motion AI initial schema: separate database from any retired product."""

import sqlalchemy as sa
from alembic import op

revision = "cosmic_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("provider_id", sa.Text(), nullable=False),
        sa.Column("collection", sa.String(64), nullable=False),
        sa.Column("release", sa.String(32), nullable=False),
        sa.Column("ra_deg", sa.Float(), nullable=False),
        sa.Column("dec_deg", sa.Float(), nullable=False),
        sa.Column("epoch_mjd", sa.Numeric(20, 10)),
        sa.Column("time_scale", sa.String(16)),
        sa.Column("detector", sa.String(16)),
        sa.Column("access_url", sa.Text(), nullable=False),
        sa.Column("source_metadata", sa.JSON(), nullable=False),
        sa.Column(
            "retrieved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("collection", "release", "provider_id", name="uq_observation_provider"),
        sa.CheckConstraint("ra_deg >= 0 AND ra_deg < 360", name="ck_observation_ra"),
        sa.CheckConstraint("dec_deg >= -90 AND dec_deg <= 90", name="ck_observation_dec"),
    )
    op.create_table(
        "analysis_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("pipeline_version", sa.String(32), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("idempotency_key", sa.String(128), unique=True),
        sa.Column("worker_id", sa.String(128)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.String(64)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('queued','running','succeeded','failed','canceled')",
            name="ck_analysis_status",
        ),
    )
    op.create_index("ix_analysis_runs_status", "analysis_runs", ["status"])
    op.create_table(
        "analysis_inputs",
        sa.Column(
            "analysis_id",
            sa.String(36),
            sa.ForeignKey("analysis_runs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "observation_id", sa.String(36), sa.ForeignKey("observations.id"), primary_key=True
        ),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.UniqueConstraint("analysis_id", "ordinal", name="uq_analysis_input_order"),
        sa.CheckConstraint("ordinal >= 0", name="ck_input_order"),
    )
    op.create_table(
        "stage_executions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "analysis_id",
            sa.String(36),
            sa.ForeignKey("analysis_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(64), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("analysis_id", "stage", "attempt", name="uq_stage_attempt"),
        sa.CheckConstraint("attempt >= 1", name="ck_stage_attempt"),
    )
    op.create_index("ix_stage_executions_analysis_id", "stage_executions", ["analysis_id"])
    op.create_table(
        "model_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("method", sa.String(16), nullable=False),
        sa.Column("calibrated", sa.Boolean(), nullable=False),
        sa.Column("weights_key", sa.Text()),
        sa.Column("weights_sha256", sa.String(64)),
        sa.Column("evaluation", sa.JSON(), nullable=False),
        sa.UniqueConstraint("name", "version", name="uq_model_version"),
    )
    op.create_table(
        "candidates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "analysis_id",
            sa.String(36),
            sa.ForeignKey("analysis_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("classification", sa.String(32), nullable=False),
        sa.Column("ra_deg", sa.Float()),
        sa.Column("dec_deg", sa.Float()),
        sa.Column("displacement_arcsec", sa.Float()),
        sa.Column("score", sa.Float()),
        sa.Column("score_kind", sa.String(32), nullable=False),
        sa.Column("model_version_id", sa.String(36), sa.ForeignKey("model_versions.id")),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.CheckConstraint("score >= 0 AND score <= 1", name="ck_candidate_score"),
        sa.CheckConstraint(
            "classification IN ('possible_motion','brightness_change','artifact','uncertain')",
            name="ck_candidate_class",
        ),
    )
    op.create_index("ix_candidates_analysis_id", "candidates", ["analysis_id"])
    op.create_table(
        "artifacts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "analysis_id", sa.String(36), sa.ForeignKey("analysis_runs.id", ondelete="CASCADE")
        ),
        sa.Column("observation_id", sa.String(36), sa.ForeignKey("observations.id")),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("storage_key", sa.Text(), unique=True, nullable=False),
        sa.Column("content_type", sa.String(64), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("provenance", sa.JSON(), nullable=False),
        sa.CheckConstraint("size_bytes >= 0", name="ck_artifact_size"),
    )
    op.create_index("ix_artifacts_analysis_id", "artifacts", ["analysis_id"])


def downgrade():
    for table in (
        "artifacts",
        "candidates",
        "model_versions",
        "stage_executions",
        "analysis_inputs",
        "analysis_runs",
        "observations",
    ):
        op.drop_table(table)
