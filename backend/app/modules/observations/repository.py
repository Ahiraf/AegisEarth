import json

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.modules.observations.discovery_models import DiscoverySnapshot, SourceProduct


class DiscoveryRepository:
    def __init__(self, db):
        self.db = db

    def find(self, *, snapshot_id=None, query_hash=None, product_id=None):
        if product_id:
            product = self.db.get(SourceProduct, product_id)
            return product.payload if product else None
        statement = select(DiscoverySnapshot)
        if snapshot_id:
            statement = statement.where(DiscoverySnapshot.id == snapshot_id)
        else:
            statement = statement.where(DiscoverySnapshot.query_hash == query_hash).order_by(
                DiscoverySnapshot.created_at.desc(), DiscoverySnapshot.id.desc()
            )
        snapshot = self.db.scalars(statement.limit(1)).first()
        return snapshot.payload if snapshot else None

    def save(self, snapshot, products):
        # No upserts that mutate scientific metadata. Hash collisions/conflicts must match exactly.
        for product in products:
            existing = self.db.get(SourceProduct, product["id"])
            if existing:
                if existing.payload != product:
                    raise ValueError("Immutable product conflict")
                continue
            try:
                with self.db.begin_nested():
                    self.db.add(SourceProduct(id=product["id"], payload=product))
                    self.db.flush()
            except IntegrityError:
                if self.db.get(SourceProduct, product["id"]).payload != product:
                    raise ValueError("Immutable product conflict") from None
        from datetime import datetime

        self.db.add(
            DiscoverySnapshot(
                id=snapshot["id"],
                query_hash=snapshot["query_hash"],
                created_at=datetime.fromisoformat(snapshot["created_at_utc"]),
                payload=snapshot,
            )
        )
        self.db.commit()


class GatewayDiscoveryRepository:
    def __init__(self, gateway):
        self.gateway = gateway

    def find(self, *, snapshot_id=None, query_hash=None, product_id=None):
        return self.gateway.rpc(
            "discovery_lookup",
            {
                "p_snapshot_id": snapshot_id,
                "p_query_hash": query_hash,
                "p_product_id": product_id,
            },
        )

    def save(self, snapshot, products):
        # Same hard payload cap in native and HTTPS transports; one transactional RPC.
        check_size(snapshot, products)
        self.gateway.rpc("discovery_save", {"p_snapshot": snapshot, "p_products": products})


def check_size(snapshot, products):
    if len(json.dumps({"snapshot": snapshot, "products": products}).encode()) > 900_000:
        from app.modules.observations.provider import ProviderError

        raise ProviderError("snapshot_budget_exceeded")
