from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.frontend import mount_frontend
from app.modules.catalog.router import router as catalog_router
from app.modules.health.router import router as health_router

settings = get_settings()
app = FastAPI(title="AegisEarth API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_methods=["GET"], allow_headers=["Accept", "Content-Type"])
app.include_router(health_router, prefix="/api/v1")
app.include_router(catalog_router, prefix="/api/v1")
mount_frontend(app, settings.static_dir)
