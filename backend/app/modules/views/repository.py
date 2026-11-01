"""Native and HTTPS transports call the same transactional PostgreSQL functions."""

import json

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.gateway import GatewayConflict, GatewayQuota, GatewayRepository

PUBLIC_METHODS = {
    "release_refresh_claim",
    "release_refresh_finish",
    "release_refresh_status",
    "derived_submit",
    "movie_lookup",
    "movie_publish",
    "frame_set_get",
    "view_submit",
    "view_replay",
    "view_get",
    "view_cancel",
    "view_artifact",
    "view_preflight",
}
WORKER_METHODS = {
    "prepare_frame_upload",
    "complete_prepared_view",
    "claim_view_job",
    "view_heartbeat",
    "view_pin",
    "view_prepare_upload",
    "complete_view",
    "fail_view",
}


class NativeViewRepository:
    def __init__(self, session):
        self.session = session

    def rpc(self, method, parameters=None):
        if method not in PUBLIC_METHODS | WORKER_METHODS:
            raise ValueError("Unapproved view operation")
        params = parameters or {}
        expressions, bindings = [], {}
        for name, value in params.items():
            if not name.startswith("p_") or not name.replace("_", "").isalnum():
                raise ValueError("Invalid RPC parameter")
            if isinstance(value, (dict, list)):
                expressions.append(f"{name}=>CAST(:{name} AS jsonb)")
                bindings[name] = json.dumps(value)
            else:
                expressions.append(f"{name}=>:{name}")
                bindings[name] = value
        try:
            result = self.session.execute(
                text(f"SELECT gateway.{method}({','.join(expressions)})"), bindings
            ).scalar_one()
            self.session.commit()
            return result
        except DBAPIError as exc:
            self.session.rollback()
            code = getattr(exc.orig, "sqlstate", None)
            if code == "PT409":
                raise GatewayConflict("view_conflict") from exc
            if code == "PT429":
                raise GatewayQuota("view_quota") from exc
            raise


class HTTPSViewRepository:
    def __init__(self, gateway: GatewayRepository):
        self.gateway = gateway

    def rpc(self, method, parameters=None):
        if method not in PUBLIC_METHODS:
            raise ValueError("Workers use native PostgreSQL")
        return self.gateway.rpc(method, parameters)
