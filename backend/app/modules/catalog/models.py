from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class NeoObject(Base):
    """Catalog identity only; encounter-specific observations get separate tables later."""

    __tablename__ = "neo_objects"
    __table_args__ = (
        CheckConstraint("object_type IN ('asteroid', 'comet')", name="ck_object_type"),
        CheckConstraint("diameter_min_km >= 0", name="ck_diameter_min"),
        CheckConstraint("diameter_max_km >= diameter_min_km", name="ck_diameter_range"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    object_type: Mapped[str] = mapped_column(String(16))
    diameter_min_km: Mapped[float | None] = mapped_column(Float)
    diameter_max_km: Mapped[float | None] = mapped_column(Float)
    source_url: Mapped[str] = mapped_column(String(2048))
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
