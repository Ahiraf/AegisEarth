from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SkyView(Base):
    __tablename__ = "sky_views"
    id: Mapped[str] = mapped_column(ForeignKey("processing_jobs.id"), primary_key=True)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("discovery_snapshots.id"))
    owner_scope: Mapped[str] = mapped_column(String(64), index=True)
    cancel_digest: Mapped[str] = mapped_column(String(64))
    cache_key: Mapped[str] = mapped_column(String(64), index=True)
    canonical: Mapped[dict] = mapped_column(JSON)
    retry_after_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ViewSubmission(Base):
    __tablename__ = "view_submissions"
    __table_args__ = (
        UniqueConstraint("scope", "key_hash", name="uq_view_submission_key"),
        Index("ix_view_submission_client_time", "scope", "created_at"),
        Index("ix_view_submission_ip_time", "ip_hash", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scope: Mapped[str] = mapped_column(String(64))
    ip_hash: Mapped[str] = mapped_column(String(64))
    key_hash: Mapped[str] = mapped_column(String(64))
    request_hash: Mapped[str] = mapped_column(String(64))
    view_id: Mapped[str] = mapped_column(ForeignKey("sky_views.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ViewInputPin(Base):
    __tablename__ = "view_input_pins"
    view_id: Mapped[str] = mapped_column(ForeignKey("sky_views.id"), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("source_products.id"), primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64))


class ViewFile(Base):
    __tablename__ = "view_files"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    view_id: Mapped[str] = mapped_column(ForeignKey("sky_views.id"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("source_products.id"))
    payload: Mapped[dict] = mapped_column(JSON)
    storage_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
