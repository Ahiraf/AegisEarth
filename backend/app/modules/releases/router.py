import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app.core.config import get_settings
from app.modules.observations.router import Service as DiscoveryDependency
from app.modules.observations.schemas import DiscoverySearch
from app.modules.releases.refresh import refresh
from app.modules.releases.registry import REGISTRY_VERSION, SIA_URL, SOURCES
from app.modules.views.router import Repository

router = APIRouter(prefix="/releases", tags=["releases"])


@router.get("")
def releases():
    return {
        "registry_version": REGISTRY_VERSION,
        "reviewed_at_utc": "2026-10-31T00:00:00Z",
        "provider": "NASA/IPAC IRSA",
        "endpoint": SIA_URL,
        "source": "https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/",
        "refresh": "curated_registry; discovery snapshots revalidate after TTL",
        "items": list(SOURCES.values()),
        "warnings": ["SIA ingestion can lag archive ingestion by approximately a day"],
        "discovery_ttl_seconds": get_settings().discovery_ttl_seconds,
        "release_activation": "Curated adapter/schema/PSF/calibration validation required; refresh never auto-enables unknown releases",
    }


@router.get("/refresh-status")
def refresh_status(repository: Repository):
    return {
        "registry_version": REGISTRY_VERSION,
        "checks": repository.rpc("release_refresh_status"),
        "warning": "Last metadata check is not scientific calibration approval or complete archive coverage",
    }


@router.post("/refresh")
def admin_refresh(
    query: DiscoverySearch,
    repository: Repository,
    discovery: DiscoveryDependency,
    authorization: Annotated[str | None, Header()] = None,
):
    configured = get_settings().refresh_admin_token
    if (
        not configured
        or not authorization
        or len(configured.get_secret_value()) < 32
        or not secrets.compare_digest(
            authorization.encode(), ("Bearer " + configured.get_secret_value()).encode()
        )
    ):
        raise HTTPException(403, detail={"code": "refresh_admin_required"})
    return refresh(repository, discovery, query, get_settings())
