from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.catalog.models import NeoObject


def list_objects(db: Session, object_type: str | None, limit: int, offset: int):
    query = select(NeoObject)
    if object_type:
        query = query.where(NeoObject.object_type == object_type)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(query.order_by(NeoObject.id).offset(offset).limit(limit)).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def get_object(db: Session, object_id: str):
    return db.get(NeoObject, object_id)
