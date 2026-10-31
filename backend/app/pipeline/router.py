from fastapi import APIRouter

from app.core.config import get_settings
from app.pipeline.registry import describe_pipeline

router = APIRouter(tags=["system"])


@router.get("/system/capabilities")
def capabilities():
    return {
        "service": "Cosmic Motion AI",
        "state": "chronological_movie_delivery_implemented",
        "view_submission_available": bool(
            get_settings().public_token_secret
            and len(get_settings().public_token_secret.get_secret_value()) >= 32
        ),
        "view_contract": "view-v2",
        "view_contracts": ["view-v1", "view-v2"],
        "frame_preparation_available": True,
        "movie_manifest_available": True,
        "movie_contract": "movie-v1",
        "view_success_stage": "inputs_ready",
        "view_success_stages": {"view-v1": "inputs_ready", "view-v2": "frames_prepared"},
        "discovery_available": True,
        "discovery_contract": "discovery-v1",
        "viewer_execution_available": True,
        "pipeline": describe_pipeline(),
    }
