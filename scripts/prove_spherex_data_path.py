"""Reproduce milestone-one inspection offline, or download the three pinned cutouts."""

import argparse
import importlib.metadata
import json
import platform
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from research_io import download, sha256

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.modules.comparisons.feasibility import assess_pair
from app.modules.observations.feasibility import inspect_cutout, measure_pair_geometry

MANIFEST = ROOT / "docs/research/data_path_manifest.json"


def run(download_missing=False):
    import psutil

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    inspected, paths, downloads = {}, {}, {}
    process = psutil.Process()
    sampled_rss = [process.memory_info().rss]
    started = time.perf_counter()
    for asset in manifest["cutouts"]:
        path = (ROOT / asset["local_path"]).resolve()
        if not path.is_relative_to(ROOT / "var/research/data_path"):
            raise ValueError("Research output must remain in the data-path cache")
        if not path.exists():
            if not download_missing:
                raise FileNotFoundError(f"Missing {path.name}; rerun with --download")
            downloads[asset["role"]] = download(
                asset["cutout_url"],
                path,
                maximum_bytes=16 * 1024 * 1024,
                expected_sha256=asset["sha256"],
            )
        if path.stat().st_size != asset["bytes"] or sha256(path) != asset["sha256"]:
            raise ValueError(f"Pinned fixture integrity failure: {path.name}")
        summary = inspect_cutout(path, manifest["target"]["ra_deg"], manifest["target"]["dec_deg"])
        if summary["observation_id"] != asset["observation_id"]:
            raise ValueError("FITS identity does not match fixture manifest")
        summary.update(collection=asset["collection"], processing_family=asset["processing_family"])
        inspected[asset["role"]] = summary
        paths[asset["role"]] = path
        sampled_rss.append(process.memory_info().rss)
    pairs = {}
    for role in ("compatible_repeat", "incompatible_control"):
        geometry = measure_pair_geometry(paths["reference"], paths[role])
        pairs[role] = assess_pair(inspected["reference"], inspected[role], geometry)
        sampled_rss.append(process.memory_info().rss)
    if not pairs["compatible_repeat"]["feasible_for_backend_development"]:
        raise ValueError("Curated repeat pair no longer passes the reviewed engineering gates")
    if pairs["incompatible_control"]["feasible_for_backend_development"]:
        raise ValueError("Wavelength-negative control was incorrectly accepted")
    return {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "manifest_sha256": sha256(MANIFEST),
        "scope": "offline_real_data_engineering_feasibility_not_motion_detection",
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "logical_cpus": psutil.cpu_count(),
            "packages": {
                name: importlib.metadata.version(name) for name in ("astropy", "numpy", "psutil")
            },
        },
        "observations": inspected,
        "comparisons": pairs,
        "profile": {
            "total_seconds_including_optional_downloads": round(time.perf_counter() - started, 6),
            "maximum_sampled_process_rss_bytes": max(sampled_rss),
            "memory_method": "RSS sampled before/after operations; not a true peak or incremental allocation",
            "download_seconds_this_run": downloads,
            "total_cutout_bytes": sum(asset["bytes"] for asset in manifest["cutouts"]),
            "gpu_required_for_this_probe": False,
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Fetch missing pinned IRSA cutouts")
    args = parser.parse_args()
    report = run(args.download)
    output = ROOT / "docs/research/data_path_report.json"
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "report": str(output),
                "profile": report["profile"],
                "compatible_pair": report["comparisons"]["compatible_repeat"][
                    "feasible_for_backend_development"
                ],
                "negative_blockers": report["comparisons"]["incompatible_control"][
                    "blocking_reasons"
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
