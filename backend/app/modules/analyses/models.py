from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed','canceled')",
            name="ck_analysis_status",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    pipeline_version: Mapped[str] = mapped_column(String(32))
    config: Mapped[dict] = mapped_column(JSON)
    request_hash: Mapped[str] = mapped_column(String(64))
    idempotency_key: Mapped[str | None] = mapped_column(String(128), unique=True)
    worker_id: Mapped[str | None] = mapped_column(String(128))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AnalysisInput(Base):
    __tablename__ = "analysis_inputs"
    __table_args__ = (
        UniqueConstraint("analysis_id", "ordinal", name="uq_analysis_input_order"),
        CheckConstraint("ordinal >= 0", name="ck_input_order"),
    )
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="CASCADE"), primary_key=True
    )
    observation_id: Mapped[str] = mapped_column(ForeignKey("observations.id"), primary_key=True)
    ordinal: Mapped[int] = mapped_column(Integer)


class StageExecution(Base):
    __tablename__ = "stage_executions"
    __table_args__ = (
        UniqueConstraint("analysis_id", "stage", "attempt", name="uq_stage_attempt"),
        CheckConstraint("attempt >= 1", name="ck_stage_attempt"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[str] = mapped_column(String(64))
    attempt: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    metrics: Mapped[dict] = mapped_column(JSON)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
