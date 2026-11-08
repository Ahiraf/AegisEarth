"""Native cutouts and SkyBoT are evaluated only in an isolated asynchronous job."""

import math
import re
import shutil
from concurrent.futures import ThreadPoolExecutor
from itertools import pairwise
from uuid import UUID, uuid5

import astropy.units as u
from astropy.coordinates import SkyCoord

from app.core.config import Settings
from app.core.database import SessionLocal
from app.modules.analyses.derived_executor import await_ack, publish_receipt
from app.modules.artifacts.storage import StorageError, get_store
from app.modules.cutouts.acquisition import AcquisitionError, download, validate_fits
from app.modules.preprocessing.pipeline import json_safe
from app.modules.preprocessing.readers import read_native
from app.modules.ranking.package import MODEL_SHA256, MODEL_VERSION, load_package
from app.modules.ranking.visits import midpoint, native_url, reject_preset_field
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
}


def acquire(product, region, path, limits, store, cached=None, expected=None):
    url = native_url(product, region)
    receipt = None
    if cached:
        try:
            with store.open_verified(cached) as source, path.open("wb") as destination:
                shutil.copyfileobj(source, destination, 65536)
            receipt = {
                "sha256": cached["sha256"],
                "size_bytes": cached["size_bytes"],
                "source_url": url,
            }
        except StorageError:
            receipt = None
    if receipt is None:
        for attempt in range(2):
            try:
                receipt = download(
                    url,
                    path,
                    limits["per_file_bytes"],
                    expected=expected,
                    read_timeout=60,
                    connect_timeout=15,
                )
                break
            except AcquisitionError as exc:
                if str(exc) != "source_unavailable" or attempt:
                    raise
    if expected and receipt["sha256"] != expected:
        raise ValueError("ranker_source_changed")
    receipt["validation"] = validate_fits(path, product, limits)
    receipt["product_id"] = product["id"]
    return receipt


def map_candidate(candidate, result, frames, products, metadata, job_id):
    by_path = {f["path"]: i for i, f in enumerate(frames)}
    used_paths = set(result["frames_used"])
    used = [f for f in frames if f["path"] in used_paths] or frames
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
        }
        for f in frames
    ]
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
            "origin": "IMCCE SkyBoT",
            "known_object": {"name": candidate["name"], "number": candidate.get("number")},
            "v_mag": candidate["v_mag"],
            "warnings": warnings,
            "warning_messages": messages,
            "explanation_codes": result["explanation_codes"],
            "span_hours": result["span_hours"],
            "frames_used": [p["product_id"] for p in positions if p["used_for_score"]],
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


def score_candidates(paths, products, region, candidates, job_id, maximum):
    features, _, model = load_package()
    metadata = [
        read_native(path, product, region).metadata
        for path, product in zip(paths, products, strict=True)
    ]
    results = []
    for candidate in candidates[:maximum]:
        predicted = {float(f["mjd"]): f for f in candidate["frames"]}
        frames = [
            {
                "path": str(paths[index]),
                "mjd": epoch,
                "ra": float(predicted[epoch]["ra"]),
                "dec": float(predicted[epoch]["dec"]),
            }
            for index, product in enumerate(products)
            if (epoch := midpoint(product)) in predicted
        ]
        if len(frames) < 4 or not all(
            math.isfinite(f["ra"])
            and 0 <= f["ra"] < 360
            and math.isfinite(f["dec"])
            and -90 <= f["dec"] <= 90
            for f in frames
        ):
            continue
        first = SkyCoord(frames[0]["ra"], frames[0]["dec"], unit="deg")
        if all(
            first.separation(SkyCoord(f["ra"], f["dec"], unit="deg")) < 1e-6 * u.arcsec
            for f in frames
        ):
            continue
        versions = {
            match[0] for p in products if (match := re.match(r"l2b-v\d+", p["calibration_version"]))
        }
        limited = next(
            (version for version in sorted(versions) if version in model["limited_versions"]), None
        )
        version = limited or (next(iter(versions)) if len(versions) == 1 else None)
        result = features.rank(frames, model, v_mag=candidate["v_mag"], version=version)
        matched = [index for index, p in enumerate(products) if midpoint(p) in predicted]
        results.append(
            map_candidate(
                candidate,
                result,
                frames,
                [products[i] for i in matched],
                [metadata[i] for i in matched],
                job_id,
            )
        )
    return json_safe(results)


def execute(job, root):
    config = job["config"]
    products, region, limits = config["products"], config["region"], config["limits"]
    if not 6 <= len(products) <= 12:
        raise ValueError("ranker_requires_six_to_twelve_exposures")
    reject_preset_field(region, products)
    if any(midpoint(b) - midpoint(a) > 0.5 for a, b in pairwise(products)):
        raise ValueError("ranker_requires_one_visit")
    try:
        _, finder, _ = load_package()
    except (ImportError, OSError, ValueError, KeyError) as exc:
        raise AcquisitionError("metadata_ranker_unavailable") from exc
    store = get_store(Settings(_env_file=None, **job["storage"]))
    paths = [root / f"{index}.fits" for index in range(len(products))]
    cached = []
    with SessionLocal() as session:
        repository = NativeViewRepository(session)
        for product in products:
            cached.append(
                repository.rpc(
                    "ranker_cutout_lookup",
                    {
                        "p_product": product["id"],
                        "p_url": native_url(product, region),
                    },
                )
            )
    # Divide the total input budget across bounded parallel downloads.
    bounded = {
        **limits,
        "per_file_bytes": min(limits["per_file_bytes"], limits["total_bytes"] // len(products)),
    }

    def fetch(index):
        return acquire(
            products[index],
            region,
            paths[index],
            bounded,
            store,
            cached[index],
            job.get("pins", {}).get(products[index]["id"]),
        )

    with ThreadPoolExecutor(max_workers=3) as executor:
        receipts = list(executor.map(fetch, range(len(products))))
    for index, (receipt, path) in enumerate(zip(receipts, paths, strict=True)):
        receipt["index"] = index
        publish_receipt(root, f"{index}.json", receipt)
        record = await_ack(root, f"{index}.upload.json")
        store.put(path, record)
    search_frames = [
        {"ra": region["ra_deg"], "dec": region["dec_deg"], "mjd": midpoint(p)} for p in products
    ]
    try:
        candidates = finder.find_candidates(search_frames, radius_deg=0.18)
    except Exception as exc:
        raise AcquisitionError("skybot_unavailable") from exc
    results = score_candidates(
        paths, products, region, candidates, job["id"], config["max_candidates"]
    )
    report = {
        "contract_version": "metadata-ranker-v1",
        "method": "metadata_ranker",
        "score_kind": "candidate_score",
        "model": {"version": MODEL_VERSION, "sha256": MODEL_SHA256},
        "candidate_count": len(results),
        "skybot_candidate_count": len(candidates),
        "candidates": results,
        "warnings": config.get("discovery_warnings", [])
        + (["CANDIDATE_LIMIT_REACHED"] if len(candidates) > config["max_candidates"] else []),
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
        "outcome": (
            "candidates_ranked"
            if any(c["score"] is not None for c in results)
            else "candidates_unscored"
            if results
            else "no_eligible_candidate_tracks"
            if candidates
            else "no_known_candidates"
        ),
    }
    publish_receipt(root, "ranker.json", json_safe(report))
