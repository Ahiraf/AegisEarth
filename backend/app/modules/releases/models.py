from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RefreshCheck(Base):
    __tablename__ = "release_refresh_checks"
    query_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    lease_token: Mapped[str] = mapped_column(String(36))
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lease_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict] = mapped_column(JSON)
