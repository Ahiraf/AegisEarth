from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Float,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Observation(Base):
    __tablename__ = "observations"
    __table_args__ = (
        UniqueConstraint("collection", "release", "provider_id", name="uq_observation_provider"),
        CheckConstraint("ra_deg >= 0 AND ra_deg < 360", name="ck_observation_ra"),
        CheckConstraint("dec_deg >= -90 AND dec_deg <= 90", name="ck_observation_dec"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    provider_id: Mapped[str] = mapped_column(Text)
    collection: Mapped[str] = mapped_column(String(64))
    release: Mapped[str] = mapped_column(String(32))
    ra_deg: Mapped[float] = mapped_column(Float)
    dec_deg: Mapped[float] = mapped_column(Float)
    epoch_mjd: Mapped[Decimal | None] = mapped_column(Numeric(20, 10))
    time_scale: Mapped[str | None] = mapped_column(String(16))
    detector: Mapped[str | None] = mapped_column(String(16))
    access_url: Mapped[str] = mapped_column(Text)
    source_metadata: Mapped[dict] = mapped_column(JSON)
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
