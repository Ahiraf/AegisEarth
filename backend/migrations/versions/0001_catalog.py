"""Initial object catalog."""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "neo_objects",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("object_type", sa.String(16), nullable=False),
        sa.Column("diameter_min_km", sa.Float()),
        sa.Column("diameter_max_km", sa.Float()),
        sa.Column("source_url", sa.String(2048), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("object_type IN ('asteroid', 'comet')", name="ck_object_type"),
        sa.CheckConstraint("diameter_min_km >= 0", name="ck_diameter_min"),
        sa.CheckConstraint("diameter_max_km >= diameter_min_km", name="ck_diameter_range"),
    )
    op.create_index("ix_neo_objects_name", "neo_objects", ["name"])


def downgrade():
    op.drop_table("neo_objects")
