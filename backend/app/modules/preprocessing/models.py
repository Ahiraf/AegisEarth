from sqlalchemy import JSON, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PreparedFrameSet(Base):
    __tablename__ = "prepared_frame_sets"
    view_id: Mapped[str] = mapped_column(ForeignKey("sky_views.id"), primary_key=True)
    report: Mapped[dict] = mapped_column(JSON)


class PreparedArtifact(Base):
    __tablename__ = "prepared_artifacts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    view_id: Mapped[str] = mapped_column(ForeignKey("sky_views.id"), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    storage_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
