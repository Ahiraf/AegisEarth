"""Immutable, source-bound chronological movie manifests."""

from pathlib import Path

from alembic import op

from app.modules.views import movie_models

revision = "cosmic_0006"
down_revision = "cosmic_0005"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    movie_models.MovieManifestRecord.__table__.create(bind)
    if bind.dialect.name == "postgresql":
        op.execute(
            Path(movie_models.__file__).with_name("movie_gateway.sql").read_text(encoding="utf-8")
        )


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION gateway.movie_publish(text,jsonb,jsonb,text)")
        op.execute("DROP FUNCTION gateway.movie_lookup(text)")
        from app.modules.preprocessing import models

        sql = Path(models.__file__).with_name("gateway.sql").read_text(encoding="utf-8")
        op.execute(sql[sql.index("CREATE OR REPLACE FUNCTION gateway.readiness()") :])
    movie_models.MovieManifestRecord.__table__.drop(op.get_bind())
