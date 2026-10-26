from fastapi import APIRouter

from app.pipeline.registry import describe_pipeline

router = APIRouter(tags=["system"])


@router.get("/system/capabilities")
def capabilities():
    return {
        "service": "Cosmic Motion AI",
        "state": "backend_scaffold",
        "discovery_available": False,
        "pipeline": describe_pipeline(),
    }
