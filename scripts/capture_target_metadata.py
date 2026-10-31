"""Bounded four-collection evidence for all prescribed fields; no live search API is enabled."""

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from http.client import IncompleteRead
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode

from astropy.io.votable import parse_single_table
from capture_spherex_metadata import summarize
from research_io import download, sha256

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.modules.releases.registry import COLLECTIONS, REGISTRY_VERSION, SIA_URL
from app.modules.targets.catalog import load_targets

OUTPUT = ROOT / "docs/research/target_feasibility"


def capture(target, collection):
    position = target.search_position("2026-01-01T00:00:00")
    params = {
        "COLLECTION": collection,
        "POS": f"CIRCLE {position['ra_deg']:.10f} {position['dec_deg']:.10f} 0.025",
        "MAXREC": 120,
    }
    url = SIA_URL + "?" + urlencode(params)
    path = OUTPUT / "metadata" / f"{target.slug}_{collection}.xml"
    receipt_path = path.with_suffix(".json")
    if receipt_path.exists() and path.exists():
        previous = json.loads(receipt_path.read_text())
        if sha256(path) == previous["sha256"]:
            return previous
    started = datetime.now(UTC).isoformat()
    try:
        elapsed = download(url, path, maximum_bytes=8 * 1024 * 1024)
        summary = summarize(path)
        table = parse_single_table(path).to_table(use_names_over_ids=True)
        bands = sorted({str(value) for value in table["energy_bandpassname"]})
        result = {
            "target": target.slug,
            "collection": collection,
            "url": url,
            "started_at_utc": started,
            "retrieved_at_utc": datetime.now(UTC).isoformat(),
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
            "snapshot_path": path.relative_to(ROOT).as_posix(),
            "search_position": position,
            "radius_deg": 0.025,
            "elapsed_seconds": elapsed,
            "detectors": bands,
            **summary,
        }
    except (OSError, URLError, IncompleteRead, ValueError) as exc:
        result = {
            "target": target.slug,
            "collection": collection,
            "url": url,
            "started_at_utc": started,
            "finished_at_utc": datetime.now(UTC).isoformat(),
            "error_type": type(exc).__name__,
            "error": str(exc)[:180],
        }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(result, indent=2) + "\n")
    return result


def main():
    targets = load_targets()
    results = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        tasks = [
            pool.submit(capture, target, collection)
            for target in targets
            for collection in COLLECTIONS
        ]
        for future in as_completed(tasks):
            result = future.result()
            results.append(result)
            print(
                result["target"],
                result["collection"],
                result.get("rows", result.get("error_type")),
                flush=True,
            )
    results.sort(key=lambda row: (row["target"], row["collection"]))
    (OUTPUT / "discovery_report.json").write_text(
        json.dumps(
            {
                "registry_version": REGISTRY_VERSION,
                "scope": "bounded_existence_sample_not_survey_completeness",
                "captures": results,
            },
            indent=2,
        )
        + "\n"
    )
    if any("error_type" in result for result in results):
        raise SystemExit("One or more source requests failed; receipts preserve the failure")


if __name__ == "__main__":
    main()
