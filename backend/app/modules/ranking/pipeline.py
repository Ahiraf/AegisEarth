"""Native cutouts and SkyBoT are evaluated only in an isolated asynchronous job."""

import hashlib
import math
import re
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from itertools import pairwise
from uuid import UUID, uuid5

from app.core.config import Settings
from app.core.database import SessionLocal
from app.modules.analyses.derived_executor import await_ack, publish_receipt
from app.modules.artifacts.storage import StorageError, get_store
from app.modules.cutouts.acquisition import AcquisitionError, download, validate_fits
from app.modules.observations.provider import ProviderError
from app.modules.preprocessing.pipeline import json_safe
from app.modules.preprocessing.readers import read_native
from app.modules.ranking.package import MODEL_SHA256, MODEL_VERSION, load_package
from app.modules.ranking.selection import candidate_exposures, select_product, spread
from app.modules.ranking.visits import exposure_id, midpoint, native_url, reject_preset_field
from app.modules.views.repository import NativeViewRepository

WARNING_TEXT = {
    "TOO_FEW_USABLE_FRAMES": "Not enough usable frames to score this candidate.",
    "FRAME_FAILED_QC": "Some frames were excluded for data-quality reasons.",
    "POSITION_NEAR_EDGE_OR_OUTSIDE": "The predicted position is at or beyond the edge of some frames.",
    "APERTURE_UNMEASURABLE": "Too many masked pixels at the predicted position in some frames.",
    "LOW_MOTION": "Little motion across these frames; a fixed source would look the same.",
    "APERTURE_ON_CATALOG_SOURCE": "A catalogued source overlaps the position in every frame; flux may be contaminated.",
    "PREDICTED_FAINTER_THAN_TRAINING_RANGE": "Predicted brightness is outside the range this ranker was tested on.",
    "PREDICTED_BRIGHTER_THAN_TRAINING_RANGE": "Predicted brightness is outside the bright end of the tested range.",
    "LIMITED_VALIDATION_FOR_PROCESSING_VERSION": "Few validation examples exist for this data-processing version.",
    "EXTRA_FRAMES_IGNORED": "More than six frames were supplied and only the first six were used.",
    "BACKEND_WALL_TIME_LIMIT_REACHED": "The optional analysis time budget ended before this candidate could be fully processed.",
    "BACKEND_CANDIDATE_LIMIT_REACHED": "The bright-candidate processing limit was reached; this candidate was not downloaded or scored.",
    "PREDICTED_MAGNITUDE_UNAVAILABLE": "No finite predicted brightness is available; this candidate was not downloaded or scored.",
    "BACKEND_SCORING_FAILED": "This optional candidate could not be scored; the sky viewer is unaffected.",
}


def acquire(
    product,
    region,
    path,
    limits,
    store,
    cached=None,
    expected=None,
    *,
    deadline=None,
    on_download=None,
):
    url = native_url(product, region)
    receipt = None
    cache_hit = False
    if cached:
        try:
            with store.open_verified(cached) as source, path.open("wb") as destination:
                shutil.copyfileobj(source, destination, 65536)
            receipt = {
                "sha256": cached["sha256"],
                "size_bytes": cached["size_bytes"],
                "source_url": url,
            }
            cache_hit = True
        except StorageError:
            receipt = None
    if receipt is None:
        for attempt in range(2):
            try:
                if on_download:
                    on_download()
                receipt = download(
                    url,
                    path,
                    limits["per_file_bytes"],
                    expected=expected,
                    read_timeout=60,
                    connect_timeout=15,
                    deadline=deadline,
                )
                break
            except AcquisitionError as exc:
                if str(exc) != "source_unavailable" or attempt:
                    raise
    if expected and receipt["sha256"] != expected:
        raise ValueError("ranker_source_changed")
    receipt["validation"] = validate_fits(path, product, limits)
    receipt["product_id"] = product["id"]
    receipt["cache_hit"] = cache_hit
    return receipt


def map_candidate(candidate, result, frames, products, metadata, job_id, frame_evidence=None):
    by_path = {f["path"]: i for i, f in enumerate(frames)}
    used_paths = set(result["frames_used"])
    used = [f for f in frames if f["path"] in used_paths] or candidate["frames"]
    middle = sorted(used, key=lambda f: f["mjd"])[len(used) // 2]
    positions = [
        {
            "product_id": products[by_path[f["path"]]]["id"],
            "ra_deg": f["ra"],
            "dec_deg": f["dec"],
            "mid_mjd": f["mjd"],
            "time_scale": "UTC",
            "detector": products[by_path[f["path"]]]["detector"],
            "spectral": metadata[by_path[f["path"]]]["spectral"],
            "used_for_score": f["path"] in used_paths,
            "cutout_center": {"ra_deg": f["ra"], "dec_deg": f["dec"]},
        }
        for f in frames
    ]
    if frame_evidence is not None:
        positions = frame_evidence
    warnings = result["warnings"]
    messages = [
        WARNING_TEXT.get(code, code.replace("_", " ").capitalize() + ".") for code in warnings
    ]
    if (
        result["classification_hint"] == "possible_motion"
        and "APERTURE_ON_CATALOG_SOURCE" in warnings
    ):
        messages.append(
            "In crowded areas this label is wrong more often (about 1 in 8 random paths in our most crowded test field)."
        )
    return {
        "id": str(uuid5(UUID(job_id), candidate["name"])),
        "name": candidate["name"],
        "number": candidate.get("number"),
        "method": "metadata_ranker",
        "classification": result["classification_hint"],
        "classification_hint": result["classification_hint"],
        "ra_deg": middle["ra"],
        "dec_deg": middle["dec"],
        "displacement_arcsec": result["displacement_arcsec"],
        "score": result["score"],
        "score_kind": "candidate_score",
        "score_uncertainty": result["uncertainty"],
        "model_version_id": MODEL_VERSION,
        "warnings": warnings,
        "evidence": {
            "method": "metadata_ranker",
            "cutout_policy": "per_candidate_centered_v1",
            "origin": "IMCCE SkyBoT",
            "known_object": {"name": candidate["name"], "number": candidate.get("number")},
            "v_mag": candidate["v_mag"],
            "warnings": warnings,
            "warning_messages": messages,
            "explanation_codes": result["explanation_codes"],
            "span_hours": result["span_hours"],
            "frames_used": [
                p["product_id"]
                for p in positions
                if p.get("used_for_score") and p.get("product_id")
            ],
            "n_frames_used": result["n_frames_used"],
            "frames": positions,
            "evidence": result["evidence"],
            "meets_5pct_threshold": result["meets_5pct_threshold"],
            "meets_10pct_threshold": result["meets_10pct_threshold"],
            "uncertainty_meaning": "standard deviation over 50 models; not a confidence interval",
            "threshold_policy": "classification_hint uses only the validated 5% false-alert threshold",
            "ten_percent_flag": "informational_only",
        },
    }


def empty_result(warnings):
    return {
        "score": None,
        "uncertainty": None,
        "classification_hint": "uncertain",
        "frames_used": [],
        "warnings": warnings,
        "displacement_arcsec": None,
        "explanation_codes": [],
        "span_hours": None,
        "n_frames_used": 0,
        "evidence": None,
        "meets_5pct_threshold": False,
        "meets_10pct_threshold": False,
    }


def predicted_evidence(candidate, reason):
    return [
        {
            "ra_deg": float(f["ra"]),
            "dec_deg": float(f["dec"]),
            "mid_mjd": float(f["mjd"]),
            "time_scale": "UTC",
            "v_mag": f.get("v_mag", candidate["v_mag"]),
            "used_for_score": False,
            "reasons": [reason],
        }
        for f in sorted(candidate["frames"], key=lambda f: f["mjd"])
    ]


def unscored(candidate, job_id, warning):
    return map_candidate(
        candidate,
        empty_result([warning]),
        [],
        [],
        [],
        job_id,
        predicted_evidence(candidate, warning),
    )


def normalized_version(products, model):
    versions = {m[0] for p in products if (m := re.match(r"l2b-v\d+", p["calibration_version"]))}
    limited = next((v for v in sorted(versions) if v in model.get("limited_versions", [])), None)
    return limited or (next(iter(versions)) if len(versions) == 1 else None)


def frame_diagnostics(features, frame):
    # Use the unmodified package's exact QC/aperture implementation, not viewer masks/SNR.
    a = features.analyze_frame(frame["path"], frame["ra"], frame["dec"])
    reasons = []
    if not a["qc_pass"]:
        reasons.append("FRAME_FAILED_QC")
    if not a["inside"]:
        reasons.append("POSITION_NEAR_EDGE_OR_OUTSIDE")
    elif a["meas"] is None:
        reasons.append("APERTURE_UNMEASURABLE")
    detail = {k: v for k, v in a.items() if k not in {"path", "meas"}}
    detail["aperture_measurable"] = a["meas"] is not None
    return not reasons, reasons, json_safe(detail)


def process_candidates(
    job, root, candidates, package, store, deadline, lookup, publish, *, clock=time.monotonic
):
    features, _, model = package
    config = job["config"]
    products, limits = config["products"], config["limits"]
    snapshot_products = config.get("selection_products", products)
    ceiling = float(model["v_range"][1])
    results, bright = [], []
    for candidate in candidates:
        magnitude = float(candidate["v_mag"])
        if not math.isfinite(magnitude):
            results.append(unscored(candidate, job["id"], "PREDICTED_MAGNITUDE_UNAVAILABLE"))
        elif magnitude > ceiling:
            results.append(unscored(candidate, job["id"], "PREDICTED_FAINTER_THAN_TRAINING_RANGE"))
        else:
            bright.append(candidate)
    bright.sort(key=lambda c: (c["v_mag"], c["name"]))
    stats = {
        "cutout_downloads": 0,
        "cache_hits": 0,
        "input_count": 0,
        "input_bytes": 0,
        "bright_candidate_count": len(bright),
        "faint_candidate_count": sum(c["v_mag"] > ceiling for c in candidates),
        "wall_time_limit_reached": False,
    }
    lock = threading.Lock()
    limited = False

    def download_started():
        with lock:
            stats["cutout_downloads"] += 1

    for index, candidate in enumerate(bright):
        if clock() >= deadline or index >= config["max_candidates"]:
            reason = (
                "BACKEND_WALL_TIME_LIMIT_REACHED"
                if clock() >= deadline
                else "BACKEND_CANDIDATE_LIMIT_REACHED"
            )
            stats["wall_time_limit_reached"] |= reason == "BACKEND_WALL_TIME_LIMIT_REACHED"
            results.append(unscored(candidate, job["id"], reason))
            limited = True
            continue
        choices = candidate_exposures(candidate, products)
        initial = spread(choices, 8)
        remaining = [item for item in choices if item not in initial]
        evidence = predicted_evidence(candidate, "NOT_REQUESTED_ENOUGH_USABLE_FRAMES")
        by_epoch = {f["mid_mjd"]: f for f in evidence}
        frames, selected_products, metadata = [], [], []
        usable = 0
        for batch in (initial, remaining):
            if not batch or (frames and usable >= 4):
                break
            if clock() >= deadline:
                stats["wall_time_limit_reached"] = limited = True
                break
            requests = []
            for prediction, exposure in batch:
                entry = by_epoch[float(prediction["mjd"])]
                if clock() >= deadline:
                    entry["reasons"] = ["BACKEND_WALL_TIME_LIMIT_REACHED"]
                    stats["wall_time_limit_reached"] = limited = True
                    continue
                try:
                    product, origin = select_product(
                        snapshot_products, exposure, prediction, deadline
                    )
                except ProviderError as exc:
                    entry["reasons"] = ["BACKEND_PRODUCT_LOOKUP_FAILED"]
                    entry["backend_error"] = str(exc)
                    continue
                if product is None:
                    entry["reasons"] = ["NO_CONTAINING_DETECTOR_PRODUCT"]
                    continue
                center = {"ra_deg": prediction["ra"], "dec_deg": prediction["dec"]}
                url = native_url(product, center)
                key = hashlib.sha256((product["id"] + url).encode()).hexdigest()
                path = root / f"candidate_{index}_{len(frames) + len(requests)}.fits"
                requests.append(
                    (prediction, product, center, key, path, lookup(product, url), origin)
                )
            # At most three simultaneous native downloads. Reserve the remaining byte budget per batch.
            free = limits["total_bytes"] - stats["input_bytes"]
            bounded = {
                **limits,
                "per_file_bytes": min(limits["per_file_bytes"], free // max(1, len(requests))),
            }

            def fetch(item, bounded=bounded):
                _, product, center, _, path, cached, _ = item
                try:
                    if clock() >= deadline:
                        return item, None, "BACKEND_WALL_TIME_LIMIT_REACHED"
                    receipt = acquire(
                        product,
                        center,
                        path,
                        bounded,
                        store,
                        cached,
                        deadline=deadline,
                        on_download=download_started,
                    )
                    return item, receipt, None
                except (AcquisitionError, ValueError, OSError) as exc:
                    return item, None, str(exc)

            with ThreadPoolExecutor(max_workers=3) as executor:
                acquired = list(executor.map(fetch, requests))
            for item, receipt, error in acquired:
                prediction, product, center, key, path, _, origin = item
                entry = by_epoch[float(prediction["mjd"])]
                if receipt is None:
                    entry["reasons"] = [
                        "BACKEND_WALL_TIME_LIMIT_REACHED"
                        if clock() >= deadline
                        else "BACKEND_CUTOUT_UNAVAILABLE"
                    ]
                    entry["backend_error"] = error
                    continue
                receipt.update(
                    acquisition_key=key,
                    product=product,
                    cutout_center=center,
                    cutout_size_arcmin=15,
                )
                publish(receipt, path, stats["input_count"])
                stats["input_count"] += 1
                stats["input_bytes"] += receipt["size_bytes"]
                stats["cache_hits"] += int(receipt.get("cache_hit", False))
                frame = {
                    "path": str(path),
                    "ra": prediction["ra"],
                    "dec": prediction["dec"],
                    "mjd": prediction["mjd"],
                }
                entry.update(
                    product_id=product["id"],
                    detector=product["detector"],
                    cutout_center=center,
                    cutout_size_arcmin=15,
                    selection_origin=origin,
                    sha256=receipt["sha256"],
                    exposure_id=exposure_id(product),
                )
                try:
                    good, reasons, diagnostics = frame_diagnostics(features, frame)
                    usable += int(good)
                    entry.update(reasons=reasons, qc=diagnostics)
                except Exception as exc:  # noqa: BLE001 -- isolate optional package diagnostics
                    entry["reasons"] = ["BACKEND_FRAME_DIAGNOSTICS_FAILED"]
                    entry["backend_error"] = type(exc).__name__
                try:
                    spectral = read_native(path, product, center).metadata["spectral"]
                    spectral["center_reference"] = "candidate_predicted_position"
                except (ValueError, KeyError, OSError):
                    spectral = {
                        "available": False,
                        "reason": "native_spectral_metadata_unavailable",
                        "center_reference": "candidate_predicted_position",
                    }
                entry["spectral"] = spectral
                frames.append(frame)
                selected_products.append(product)
                metadata.append({"spectral": spectral})
        ordered = sorted(
            zip(frames, selected_products, metadata, strict=True), key=lambda row: row[0]["mjd"]
        )
        frames = [row[0] for row in ordered]
        selected_products = [row[1] for row in ordered]
        metadata = [row[2] for row in ordered]
        if clock() >= deadline:
            result = empty_result(["BACKEND_WALL_TIME_LIMIT_REACHED"])
            stats["wall_time_limit_reached"] = limited = True
        elif frames:
            try:
                result = features.rank(
                    frames,
                    model,
                    v_mag=candidate["v_mag"],
                    version=normalized_version(selected_products, model),
                )
            except Exception:  # noqa: BLE001 -- preserve optional candidate and viewer isolation
                result = empty_result(["BACKEND_SCORING_FAILED"])
        else:
            result = empty_result(["TOO_FEW_USABLE_FRAMES"])
        used_paths = set(result["frames_used"])
        for frame in frames:
            entry = by_epoch[float(frame["mjd"])]
            entry["used_for_score"] = frame["path"] in used_paths
            if not entry["used_for_score"] and not entry["reasons"]:
                entry["reasons"] = [
                    "USABLE_NOT_SELECTED_BY_RANKER"
                    if result["score"] is not None
                    else result["warnings"][0]
                ]
        results.append(
            map_candidate(
                candidate, result, frames, selected_products, metadata, job["id"], evidence
            )
        )
    results.sort(
        key=lambda c: (
            c["evidence"]["v_mag"] if c["evidence"]["v_mag"] is not None else math.inf,
            c["name"],
        )
    )
    return json_safe(results), stats, limited


def execute(job, root):
    started = time.monotonic()
    config = job["config"]
    products, region, limits = config["products"], config["region"], config["limits"]
    if not 6 <= len(products) <= 12:
        raise ValueError("ranker_requires_six_to_twelve_exposures")
    reject_preset_field(region, products)
    if any(midpoint(b) - midpoint(a) > 0.5 for a, b in pairwise(products)):
        raise ValueError("ranker_requires_one_visit")
    try:
        package = load_package()
    except (ImportError, OSError, ValueError, KeyError) as exc:
        raise AcquisitionError("metadata_ranker_unavailable") from exc
    _, finder, _ = package
    # Parent supplies the same monotonic deadline, reserving time for fenced publication.
    deadline = job.get("ranker_deadline", started + limits["wall_seconds"] - 15)
    search_frames = [
        {"ra": region["ra_deg"], "dec": region["dec_deg"], "mjd": midpoint(p)} for p in products
    ]
    try:
        candidates = finder.find_candidates(search_frames, radius_deg=0.18)
    except Exception as exc:
        raise AcquisitionError("skybot_unavailable") from exc
    store = get_store(Settings(_env_file=None, **job["storage"]))

    def lookup(product, url):
        with SessionLocal() as session:
            return NativeViewRepository(session).rpc(
                "ranker_cutout_lookup",
                {
                    "p_product": product["id"],
                    "p_url": url,
                },
            )

    def publish(receipt, path, index):
        publish_receipt(root, f"ranker_cutout_{index}.json", receipt)
        record = await_ack(root, f"ranker_cutout_{index}.upload.json")
        store.put(path, record)

    results, metrics, limited = process_candidates(
        job, root, candidates, package, store, deadline, lookup, publish
    )
    report = {
        "contract_version": "metadata-ranker-v1",
        "method": "metadata_ranker",
        "score_kind": "candidate_score",
        "cutout_policy": "per_candidate_centered_v1",
        "model": {"version": MODEL_VERSION, "sha256": MODEL_SHA256},
        "candidate_count": len(results),
        "skybot_candidate_count": len(candidates),
        "candidates": results,
        "warnings": config.get("discovery_warnings", [])
        + (["CANDIDATE_LIMIT_REACHED"] if limited else []),
        "visit": {
            "snapshot_id": config["ranker"]["snapshot_id"],
            "exposure_count": len(products),
            "cutout_size_arcmin": 15,
            "start_mjd": midpoint(products[0]),
            "end_mjd": midpoint(products[-1]),
        },
        "candidate_source": {
            "service": "IMCCE SkyBoT",
            "location": "500",
            "radius_deg": 0.18,
            "status": "succeeded",
        },
        "acquisition": {**metrics, "wall_seconds": time.monotonic() - started},
        "outcome": "candidates_ranked"
        if any(c["score"] is not None for c in results)
        else "candidates_unscored"
        if results
        else "no_known_candidates",
    }
    publish_receipt(root, "ranker.json", json_safe(report))
