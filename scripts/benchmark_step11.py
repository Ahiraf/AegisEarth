"""Measure frame preparation on hash-pinned real cutouts, without contacting IRSA."""

import argparse
import hashlib
import json
import resource
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
MANIFEST = ROOT / "docs/research/target_feasibility/cutouts_manifest.json"


def run_case(target, fov):
    from app.modules.observations.provider import normalize_product
    from app.modules.preprocessing.pipeline import prepare
    from app.modules.registration.grid import make_grid
    from app.modules.targets.coordinates import RectangularRegion

    rows = [row for row in json.loads(MANIFEST.read_text())["cutouts"] if row["target"] == target]
    paths = [ROOT / row["local_path"] for row in rows]
    for path, row in zip(paths, rows, strict=True):
        with path.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != row["sha256"]:
                raise ValueError(f"Pinned input checksum mismatch: {path.name}")
    center = rows[0]["fixed_sky_center"]
    region = RectangularRegion(
        ra=center["ra_deg"], dec=center["dec_deg"], width_arcmin=fov, height_arcmin=fov
    ).geometry()
    products = [normalize_product(row["source_metadata"], row["collection"]) for row in rows]
    artifact_ids = ["research:" + row["sha256"] for row in rows]
    runs = []
    for temperature in ("first", "repeat"):
        with tempfile.TemporaryDirectory(prefix="aegis-bench-") as directory:
            started = time.perf_counter()
            cpu_started = time.process_time()
            report, files = prepare(paths, products, region, artifact_ids, {}, Path(directory))
            runs.append(
                {
                    "pass": temperature,
                    "wall_seconds": round(time.perf_counter() - started, 4),
                    "cpu_seconds": round(time.process_time() - cpu_started, 4),
                    "process_peak_rss_mib": round(
                        resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2
                    ),
                    "output_bytes": sum(file["size_bytes"] for file in files),
                    "outcome": report["outcome"],
                }
            )
    return {
        "target": target,
        "fov_arcmin": fov,
        "grid_yx": make_grid(region)[1],
        "input_count": len(paths),
        "input_bytes": sum(path.stat().st_size for path in paths),
        "source_sha256": [row["sha256"] for row in rows],
        "runs": runs,
    }


def child(case):
    target, fov = case
    started = time.perf_counter()
    result = subprocess.run(
        [sys.executable, __file__, "--case", target, str(fov)],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    return {
        **json.loads(result.stdout),
        "process_total_seconds": round(time.perf_counter() - started, 4),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", nargs=2, help=argparse.SUPPRESS)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.case:
        print(json.dumps(run_case(args.case[0], float(args.case[1]))))
        return
    targets = sorted({row["target"] for row in json.loads(MANIFEST.read_text())["cutouts"]})
    cases = [child((target, fov)) for target in targets for fov in (3, 30)]
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=2) as pool:
        concurrent = list(pool.map(child, (("barnards-star", 30), ("wise-0855", 30))))
    report = {
        "verified_at_utc": datetime.now(UTC).isoformat(),
        "scope": "Linux process benchmark with real pinned native crops; first/repeat process calls share the filesystem cache",
        "limitations": "Larger output grids reuse existing input footprints. Network, queue latency and larger native downloads are outside this measurement.",
        "python": sys.version.split()[0],
        "cases": cases,
        "two_processes": {
            "elapsed_seconds": round(time.perf_counter() - started, 4),
            "cases": concurrent,
        },
    }
    rendered = json.dumps(report, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
