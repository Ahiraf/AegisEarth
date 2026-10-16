from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.catalog import repository
from app.modules.catalog.schemas import NeoPage, NeoRead

router = APIRouter(prefix="/neos", tags=["catalog"])


@router.get("", response_model=NeoPage)
def list_neos(
    db: Annotated[Session, Depends(get_db)],
    object_type: Literal["asteroid", "comet"] | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    return repository.list_objects(db, object_type, limit, offset)


@router.get("/{object_id}", response_model=NeoRead)
def get_neo(object_id: str, db: Annotated[Session, Depends(get_db)]):
    neo = repository.get_object(db, object_id)
    if neo is None:
        raise HTTPException(404, "Object not found")
    return neo
