"""Explicit authenticated PostgREST transport; never a SQLAlchemy/HTTP URL substitution."""

import ssl
from urllib.parse import urlsplit

import httpx

from app.core.config import Settings


class GatewayError(Exception):
    """Safe public classification, without an upstream URL/body/credential."""


class GatewayConflict(GatewayError):
    pass


class GatewayQuota(GatewayError):
    pass


class GatewayRepository:
    METHODS = frozenset(
        {
            "readiness",
            "enqueue_job",
            "claim_job",
            "heartbeat_job",
            "finish_job",
            "cancel_job",
            "discovery_lookup",
            "discovery_save",
            "view_submit",
            "view_replay",
            "view_get",
            "view_cancel",
            "view_artifact",
            "view_preflight",
            "frame_set_get",
        }
    )

    def __init__(self, settings: Settings, *, transport=None):
        endpoint = urlsplit(settings.gateway_url or "")
        if (
            endpoint.scheme != "https"
            or not endpoint.hostname
            or endpoint.username
            or endpoint.password
            or endpoint.query
            or endpoint.fragment
        ):
            raise ValueError("Gateway requires a credential-free HTTPS base URL")
        if not settings.gateway_token:
            raise ValueError("Gateway token is required")
        verify = (
            ssl.create_default_context(cafile=settings.gateway_ca_file)
            if settings.gateway_ca_file
            else True
        )
        self.client = httpx.Client(
            base_url=(settings.gateway_url or "").rstrip("/") + "/",
            headers={
                "Authorization": "Bearer " + settings.gateway_token.get_secret_value(),
                "Content-Profile": "gateway",
                "Accept-Profile": "gateway",
            },
            timeout=10,
            follow_redirects=False,
            verify=verify,
            transport=transport,
        )

    def rpc(self, method: str, parameters: dict | None = None):
        if method not in self.METHODS:
            raise ValueError("Unapproved gateway operation")
        try:
            with self.client.stream("POST", "rpc/" + method, json=parameters or {}) as response:
                if response.status_code == 409:
                    raise GatewayConflict("gateway_conflict")
                if response.status_code == 429:
                    raise GatewayQuota("view_quota")
                if response.status_code != 200:
                    raise GatewayError("gateway_unavailable")
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > 1024 * 1024:
                        raise GatewayError("gateway_unavailable")
                import json

                return json.loads(body)
        except (httpx.HTTPError, ValueError) as exc:
            raise GatewayError("gateway_unavailable") from exc

    def close(self):
        self.client.close()
