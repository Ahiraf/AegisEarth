"""Append-only discovery records; historical search results never change on revalidation."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SourceProduct(Base):
    __tablename__ = "source_products"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)


class DiscoverySnapshot(Base):
    __tablename__ = "discovery_snapshots"
    __table_args__ = (Index("ix_discovery_query_created", "query_hash", "created_at"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    query_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict] = mapped_column(JSON)
