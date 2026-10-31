import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.gateway import GatewayError, GatewayRepository
from app.modules.analyses.jobs import ProcessingJob
from app.modules.analyses.models import AnalysisRun
from app.modules.observations.models import Observation

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live():
    return {"status": "ok"}


@router.get("/ready")
def ready(db: Annotated[Session, Depends(get_db)]):
    settings = get_settings()
    if settings.database_transport == "postgrest":
        gateway = None
        try:
            gateway = GatewayRepository(settings)
            result = gateway.rpc("readiness")
            if result != {"status": "ready", "schema_revision": "cosmic_0005"}:
                raise GatewayError("schema_not_ready")
        except (GatewayError, ValueError, OSError):
            logging.getLogger(__name__).warning("Gateway/database readiness failed")
            return JSONResponse(status_code=503, content={"status": "not_ready"})
        finally:
            if gateway:
                gateway.close()
        return {"status": "ready", "analysis_execution": "not_implemented"}
    try:
        db.execute(select(Observation.id).limit(1))
        db.execute(select(AnalysisRun.id).limit(1))
        db.execute(select(ProcessingJob.id).limit(1))
        if (
            db.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            != "cosmic_0005"
        ):
            raise SQLAlchemyError("schema_not_ready")
    except SQLAlchemyError:
        logging.getLogger(__name__).exception("Database/schema readiness failed")
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready", "analysis_execution": "not_implemented"}
