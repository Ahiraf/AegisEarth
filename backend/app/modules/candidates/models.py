from sqlalchemy import JSON, CheckConstraint, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = (
        CheckConstraint("score >= 0 AND score <= 1", name="ck_candidate_score"),
        CheckConstraint(
            "classification IN ('possible_motion','brightness_change','artifact','uncertain')",
            name="ck_candidate_class",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="CASCADE"), index=True
    )
    classification: Mapped[str] = mapped_column(String(32))
    ra_deg: Mapped[float | None] = mapped_column(Float)
    dec_deg: Mapped[float | None] = mapped_column(Float)
    displacement_arcsec: Mapped[float | None] = mapped_column(Float)
    score: Mapped[float | None] = mapped_column(Float)
    score_kind: Mapped[str] = mapped_column(String(32))
    model_version_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id"))
    evidence: Mapped[dict] = mapped_column(JSON)
