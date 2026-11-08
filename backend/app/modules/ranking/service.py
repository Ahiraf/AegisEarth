"""Bounded ranker admission. Archive downloads and SkyBoT happen in the worker."""

import hashlib
from uuid import uuid4

from fastapi import HTTPException

from app.modules.ranking.package import MODEL_SHA256, MODEL_VERSION, available
from app.modules.ranking.visits import reject_preset_field, select_visit
from app.modules.views.security import token_digest
from app.modules.views.service import digest, policy


def submit(query, repository, discovery, settings, tokens, scope, ip, key):
    if not settings.metadata_ranker_enabled or not available():
        raise HTTPException(503, detail={"code": "metadata_ranker_unavailable"})
    snapshot = discovery.find(snapshot_id=str(query.snapshot_id))
    if not snapshot:
        raise HTTPException(404, detail={"code": "discovery_snapshot_not_found"})
    try:
        products = select_visit(snapshot["items"], query.visit_index, query.max_exposures)
        region = snapshot["canonical_query"]["region"]
        reject_preset_field(region, products)
    except ValueError as exc:
        raise HTTPException(422, detail={"code": str(exc)}) from exc
    canonical = {
        **query.model_dump(mode="json"),
        "kind": "suggestions",
        "model_version": MODEL_VERSION,
        "model_sha256": MODEL_SHA256,
        "region": region,
        "max_candidates": settings.metadata_ranker_max_candidates,
        "cutout_policy": "per_candidate_centered_v1",
    }
    limits = policy(settings)
    limits["wall_seconds"] = settings.metadata_ranker_wall_seconds
    canonical["limits"] = limits
    config = {
        "products": products,
        "selection_products": snapshot["items"],
        "region": region,
        "limits": limits,
        "ranker": canonical,
        "discovery_warnings": snapshot.get("warnings", []),
        "max_candidates": settings.metadata_ranker_max_candidates,
    }
    identifier = str(uuid4())
    result = repository.rpc(
        "ranker_submit",
        {
            "p_id": identifier,
            "p_scope": scope,
            "p_ip": ip,
            "p_key": hashlib.sha256(str(key).encode()).hexdigest(),
            "p_hash": digest(canonical),
            "p_digest": token_digest(tokens.cancel_token(identifier, scope)),
            "p_snapshot": str(query.snapshot_id),
            "p_canonical": canonical,
            "p_config": config,
            "p_policy": limits,
        },
    )
    accepted = {
        "id": result["id"],
        "method": "metadata_ranker",
        "cache_hit": not result["created"],
        "status_url": f"/api/v1/analyses/{result['id']}",
        "result_url": f"/api/v1/analyses/{result['id']}",
    }
    if result["owner"]:
        accepted["cancel_token"] = tokens.cancel_token(result["id"], scope)
    return accepted, 202 if result["created"] else 200
