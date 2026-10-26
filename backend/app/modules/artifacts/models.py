from sqlalchemy import JSON, BigInteger, Boolean, CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Artifact(Base):
    __tablename__ = "artifacts"
    __table_args__ = (CheckConstraint("size_bytes >= 0", name="ck_artifact_size"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    analysis_id: Mapped[str | None] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="CASCADE"), index=True
    )
    observation_id: Mapped[str | None] = mapped_column(ForeignKey("observations.id"))
    kind: Mapped[str] = mapped_column(String(32))
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    content_type: Mapped[str] = mapped_column(String(64))
    sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    provenance: Mapped[dict] = mapped_column(JSON)
