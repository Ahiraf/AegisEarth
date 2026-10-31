"""Append-only discovery snapshots/products and atomic HTTPS persistence."""

from pathlib import Path

from alembic import op

from app.modules.observations import discovery_models

revision = "cosmic_0003"
down_revision = "cosmic_0002"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    discovery_models.SourceProduct.__table__.create(bind)
    discovery_models.DiscoverySnapshot.__table__.create(bind)
    if bind.dialect.name == "postgresql":
        op.execute(Path(discovery_models.__file__).with_name("discovery_gateway.sql").read_text())


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP FUNCTION gateway.discovery_lookup(text,text,text)")
        op.execute("DROP FUNCTION gateway.discovery_save(jsonb,jsonb)")
        from app.modules.analyses import jobs

        sql = Path(jobs.__file__).with_name("gateway.sql").read_text()
        readiness = sql[
            sql.index("CREATE FUNCTION gateway.readiness()") : sql.index(
                "CREATE FUNCTION gateway.enqueue_job"
            )
        ]
        op.execute(readiness.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1))
    discovery_models.DiscoverySnapshot.__table__.drop(bind)
    discovery_models.SourceProduct.__table__.drop(bind)
