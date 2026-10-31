import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.gateway import GatewayError, GatewayRepository
from app.modules.observations.discovery import DiscoveryBusy, DiscoveryService
from app.modules.observations.provider import ProviderError, SIAProvider
from app.modules.observations.repository import DiscoveryRepository, GatewayDiscoveryRepository
from app.modules.observations.schemas import DiscoveryPage, DiscoverySearch, ObservationSearch

router = APIRouter(prefix="/observations", tags=["observations"])


def get_discovery_service(db: Annotated[Session, Depends(get_db)]):
    settings = get_settings()
    gateway = None
    try:
        if settings.database_transport == "postgrest":
            gateway = GatewayRepository(settings)
            repository = GatewayDiscoveryRepository(gateway)
        else:
            repository = DiscoveryRepository(db)
        yield DiscoveryService(repository, SIAProvider(settings))
    except (SQLAlchemyError, GatewayError, OSError, ValueError) as exc:
        raise HTTPException(503, detail={"code": "discovery_storage_unavailable"}) from exc
    finally:
        if gateway:
            gateway.close()


Service = Annotated[DiscoveryService, Depends(get_discovery_service)]


@router.post(
    "/search",
    response_model=DiscoveryPage,
    responses={
        429: {"description": "Discovery concurrency limit"},
        503: {"description": "Archive or persistence unavailable"},
        410: {"description": "Legacy radius search retired; use discovery-v1"},
    },
)
def search_observations(query: DiscoverySearch | ObservationSearch, service: Service):
    if isinstance(query, ObservationSearch):
        raise HTTPException(
            410, detail={"code": "legacy_search_retired", "replacement": "discovery-v1"}
        )
    try:
        return service.search(query)
    except ProviderError as exc:
        raise HTTPException(503, detail={"code": str(exc)}, headers={"Retry-After": "30"}) from exc
    except DiscoveryBusy as exc:
        raise HTTPException(
            429, detail={"code": "discovery_busy"}, headers={"Retry-After": "5"}
        ) from exc


@router.get("/snapshots/{snapshot_id}", response_model=DiscoveryPage)
def snapshot_page(
    snapshot_id: UUID,
    service: Service,
    offset: Annotated[int, Query(ge=0, le=160)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    snapshot = service.repository.find(snapshot_id=str(snapshot_id))
    if not snapshot:
        raise HTTPException(404, detail={"code": "snapshot_not_found"})
    try:
        return service.page(snapshot, offset, limit)
    except LookupError as exc:
        raise HTTPException(404, detail={"code": "page_not_found"}) from exc


@router.get("/{product_id}")
def product_detail(product_id: str, service: Service):
    if not re.fullmatch(r"[0-9a-f]{64}", product_id):
        raise HTTPException(404, detail={"code": "product_not_found"})
    product = service.repository.find(product_id=product_id)
    if not product:
        raise HTTPException(404, detail={"code": "product_not_found"})
    return product
