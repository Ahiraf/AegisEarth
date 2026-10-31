from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MovieManifestRecord(Base):
    __tablename__ = "movie_manifests"
    view_id: Mapped[str] = mapped_column(ForeignKey("sky_views.id"), primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
