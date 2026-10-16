import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.catalog.models import NeoObject

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live():
    return {"status": "ok"}


@router.get("/ready")
def ready(db: Annotated[Session, Depends(get_db)]):
    try:
        db.execute(text("SELECT 1"))
        db.execute(select(NeoObject.id).limit(1))
    except SQLAlchemyError:
        logging.getLogger(__name__).exception("Database readiness failed")
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready"}
