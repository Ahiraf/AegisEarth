from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import model_registry  # noqa: F401
from app.core.config import get_settings
from app.core.errors import FeatureUnavailable, unavailable_handler
from app.modules.analyses.router import router as analyses_router
from app.modules.health.router import router as health_router
from app.modules.observations.router import router as observations_router
from app.pipeline.router import router as pipeline_router

settings = get_settings()
app = FastAPI(title=settings.service_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type", "Idempotency-Key", "Authorization"],
)
app.add_exception_handler(FeatureUnavailable, unavailable_handler)
app.include_router(health_router, prefix="/api/v1")
app.include_router(observations_router, prefix="/api/v1")
app.include_router(analyses_router, prefix="/api/v1")
app.include_router(pipeline_router, prefix="/api/v1")
