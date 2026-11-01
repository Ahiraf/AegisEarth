import hashlib
import json
from uuid import uuid4

from app.modules.observations.discovery import canonical_query
from app.modules.views.security import token_digest


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def policy(settings):
    return {
        "client_active": settings.view_max_active_per_client,
        "client_hour": settings.view_max_hourly_per_client,
        "ip_hour": settings.view_max_hourly_per_ip,
        "queue": settings.view_max_queue,
        "wall_seconds": settings.view_wall_seconds,
        "cpu_seconds": settings.view_cpu_seconds,
        "memory_mb": settings.view_memory_mb,
        "total_bytes": settings.view_total_bytes,
        "per_file_bytes": min(settings.max_download_bytes, 134217728),
        "max_science_dimension": 512,
        "max_decoded_bytes": 67108864,
    }


class ViewService:
    def __init__(self, repository, discovery, settings, tokens):
        self.repository, self.discovery, self.settings, self.tokens = (
            repository,
            discovery,
            settings,
            tokens,
        )

    def submit(self, request, scope, ip, key, *, refresh=False):
        canonical = {
            **canonical_query(request.discovery()),
            "contract_version": request.contract_version,
            "max_frames": request.max_frames,
            "selection_policy": request.selection_policy,
            "pipeline_version": "frames-v1"
            if request.contract_version == "view-v2"
            else "acquire-v1",
        }
        if request.contract_version == "view-v2":
            canonical["preparation"] = request.preparation.model_dump()
            canonical["acquisition_policy"] = "single_release_detector_v1"
        if refresh:
            canonical["refresh_requested"] = True
        request_hash, key_hash = digest(canonical), hashlib.sha256(key.encode()).hexdigest()
        replay = self.repository.rpc(
            "view_replay", {"p_scope": scope, "p_key": key_hash, "p_hash": request_hash}
        )
        if replay:
            return self.accepted(replay, scope)
        limits = policy(self.settings)
        self.repository.rpc("view_preflight", {"p_scope": scope, "p_ip": ip, "p_policy": limits})
        if refresh:
            from app.modules.releases.refresh import refresh as refresh_metadata

            refresh_metadata(self.repository, self.discovery, request.discovery(), self.settings)
        page = self.discovery.search(request.discovery())
        snapshot = self.discovery.repository.find(snapshot_id=page["snapshot_id"])
        available = snapshot["items"]
        source_count = len(available)
        preselection = None
        if request.contract_version == "view-v2" and available:
            from app.modules.preprocessing.selection import preselect

            available, preselection = preselect(available, canonical["region"])
        count = min(len(available), request.max_frames)
        # Explicit evenly spaced sample, not an implied complete chronological movie.
        indices = sorted(
            {
                round(i * (len(available) - 1) / (count - 1)) if count > 1 else 0
                for i in range(count)
            }
        )
        products = [available[i] for i in indices]
        canonical["selection"] = {
            "sampled_count": source_count,
            "preselected_count": len(available),
            "preselection": preselection,
            "selected_count": count,
            "upstream_complete": page["upstream_complete"],
            "limited": count < source_count,
            "discovery_warnings": page["warnings"],
        }
        view_id = str(uuid4())
        token = self.tokens.cancel_token(view_id, scope)
        result = self.repository.rpc(
            "view_submit",
            {
                "p_id": view_id,
                "p_scope": scope,
                "p_ip": ip,
                "p_key": key_hash,
                "p_hash": request_hash,
                "p_digest": token_digest(token),
                "p_cache": digest({"request": request_hash, "snapshot": snapshot["id"]}),
                "p_snapshot": snapshot["id"],
                "p_canonical": canonical,
                "p_products": products,
                "p_policy": limits,
            },
        )
        return self.accepted(result, scope)

    def accepted(self, result, scope):
        view_id = result["id"]
        response = {
            "id": view_id,
            "status_url": f"/api/v1/views/{view_id}",
            "job_url": f"/api/v1/jobs/{view_id}",
            "cache_hit": not result["created"],
            "viewer_execution_available": False,
        }
        if result["owner"]:
            response["cancel_token"] = self.tokens.cancel_token(view_id, scope)
        return response, 202 if result["created"] else 200
