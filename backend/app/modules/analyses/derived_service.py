"""Admission for immutable derived jobs using the existing shared view quotas/leases/storage ledger."""

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException

from app.modules.views.security import token_digest
from app.modules.views.service import digest, policy


def submit(repository, products_repository, primary, query, kind, settings, tokens, scope, ip, key):
    canonical = {
        "contract_version": "derived-v1",
        "kind": kind,
        "primary_view_id": str(primary),
        "request": query.model_dump(mode="json"),
        "processing_version": "export-v1" if kind == "export" else "derived-v1.1",
    }
    request_hash = digest(canonical)
    import hashlib

    key_hash = hashlib.sha256(str(key).encode()).hexdigest()
    replay = repository.rpc(
        "view_replay", {"p_scope": scope, "p_key": key_hash, "p_hash": request_hash}
    )
    if replay:
        return acceptance(replay, scope, tokens, kind), 200
    repository.rpc("view_preflight", {"p_scope": scope, "p_ip": ip, "p_policy": policy(settings)})
    if primary not in {f.view_id for f in query.inputs}:
        raise HTTPException(422, detail={"code": "primary_view_must_be_an_input"})
    parents = {}
    sources = []
    products = []
    exposures = set()
    total = 0
    for selected in query.inputs:
        identifier = str(selected.view_id)
        if identifier not in parents:
            if len(parents) >= 6:
                raise HTTPException(422, detail={"code": "at_most_six_parent_views"})
            view = repository.rpc("view_get", {"p_id": identifier})
            report = repository.rpc("frame_set_get", {"p_id": identifier})
            if not view or not report or report.get("version") != "frames-v1":
                raise HTTPException(409, detail={"code": "unexpired_prepared_source_view_required"})
            if datetime.fromisoformat(view["expires_at_utc"]) <= datetime.now(UTC) + timedelta(
                minutes=15
            ):
                raise HTTPException(
                    409, detail={"code": "source_retention_too_short_resubmit_view"}
                )
            parents[identifier] = {"id": identifier, "report": report, "view": view}
        parent = parents[identifier]
        report = parent["report"]
        if selected.index >= len(report["frames"]):
            raise HTTPException(422, detail={"code": "input_frame_not_found"})
        meta = report["frames"][selected.index]
        product = products_repository.find(product_id=meta["product_id"])
        if not product or product["exposure_key"] in exposures:
            raise HTTPException(422, detail={"code": "duplicate_or_unknown_physical_exposure"})
        exposures.add(product["exposure_key"])
        products.append(product)
        if kind != "spectrum":
            first = next(iter(parents.values()))["report"]["grid"]
            if report["grid"] != first:
                raise HTTPException(409, detail={"code": "common_grid_and_region_required"})
        raw = repository.rpc("view_artifact", {"p_id": meta["raw_artifact_id"]})
        plane = report["artifacts"][meta["artifact_indices"]["planes"]]
        planes = repository.rpc("view_artifact", {"p_id": plane["id"]})
        if not raw or not planes:
            raise HTTPException(410, detail={"code": "source_artifact_expired"})
        total += raw["size_bytes"] + planes["size_bytes"]
        sources.append(
            {
                "ref": selected.model_dump(mode="json"),
                "metadata": meta,
                "raw": raw,
                "planes": planes,
            }
        )
    if total > settings.view_total_bytes // 2:
        raise HTTPException(422, detail={"code": "derived_input_byte_budget"})
    primary_parent = parents[str(primary)]
    parent_hashes = {p: digest(value["report"]) for p, value in parents.items()}
    canonical["parent_preparation_sha256"] = parent_hashes
    config = {
        "products": products,
        "sources": sources,
        "region": primary_parent["view"]["canonical_request"]["region"],
        "grid": primary_parent["report"]["grid"],
        "derived": canonical,
        "limits": policy(settings),
    }
    if len(json.dumps(config).encode()) > 384000:
        raise HTTPException(422, detail={"code": "derived_metadata_budget"})
    identifier = str(uuid4())
    result = repository.rpc(
        "derived_submit",
        {
            "p_id": identifier,
            "p_scope": scope,
            "p_ip": ip,
            "p_key": key_hash,
            "p_hash": request_hash,
            "p_digest": token_digest(tokens.cancel_token(identifier, scope)),
            "p_canonical": canonical,
            "p_parents": [{"id": p["id"], "report": p["report"]} for p in parents.values()],
            "p_config": config,
            "p_policy": policy(settings),
        },
    )
    return acceptance(result, scope, tokens, kind), 202 if result["created"] else 200


def acceptance(result, scope, tokens, kind):
    identifier = result["id"]
    response = {
        "id": identifier,
        "status_url": f"/api/v1/jobs/{identifier}",
        "result_url": f"/api/v1/{'spectra' if kind == 'spectrum' else 'coadds' if kind == 'coadd' else 'exports' if kind == 'export' else 'differences'}/{identifier}",
        "cache_hit": not result["created"],
    }
    if result["owner"]:
        response["cancel_token"] = tokens.cancel_token(identifier, scope)
    return response
