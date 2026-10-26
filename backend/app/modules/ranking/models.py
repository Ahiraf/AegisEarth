from sqlalchemy import JSON, Boolean, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ModelVersion(Base):
    __tablename__ = "model_versions"
    __table_args__ = (UniqueConstraint("name", "version", name="uq_model_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    version: Mapped[str] = mapped_column(String(32))
    method: Mapped[str] = mapped_column(String(16))
    calibrated: Mapped[bool] = mapped_column(Boolean, default=False)
    weights_key: Mapped[str | None] = mapped_column(Text)
    weights_sha256: Mapped[str | None] = mapped_column(String(64))
    evaluation: Mapped[dict] = mapped_column(JSON)
