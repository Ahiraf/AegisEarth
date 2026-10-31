from fastapi import APIRouter

from app.modules.releases.registry import REGISTRY_VERSION, SIA_URL, SOURCES

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
    }
