"""Offline reprocessing of all five pinned target samples, with source hashes preserved."""

import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.modules.observations.provider import normalize_product
from app.modules.preprocessing.pipeline import prepare
from app.modules.targets.coordinates import RectangularRegion


def main():
    rows = json.loads(
        (ROOT / "docs/research/target_feasibility/cutouts_manifest.json").read_text(
            encoding="utf-8"
        )
    )["cutouts"]
    report = {
        "verified_at_utc": datetime.now(UTC).isoformat(),
        "scope": "pinned native crops; not padded view-v2 acquisition or phase-6 target science acceptance",
        "targets": [],
    }
    run_id = str(uuid4())
    for target in sorted({r["target"] for r in rows}):
        samples = [r for r in rows if r["target"] == target]
        for row in samples:
            with (ROOT / row["local_path"]).open("rb") as stream:
                assert hashlib.file_digest(stream, "sha256").hexdigest() == row["sha256"]
        center = samples[0]["fixed_sky_center"]
        region = RectangularRegion(
            ra=center["ra_deg"], dec=center["dec_deg"], width_arcmin=3, height_arcmin=3
        ).geometry()
        products = [normalize_product(r["source_metadata"], r["collection"]) for r in samples]
        output = ROOT / "var/frame-preparation" / run_id / target
        output.mkdir(parents=True, exist_ok=True)
        result, files = prepare(
            [ROOT / r["local_path"] for r in samples],
            products,
            region,
            ["research:" + r["sha256"] for r in samples],
            {},
            output,
        )
        summary = {
            "output_directory": output.relative_to(ROOT).as_posix(),
            "target": target,
            "input_count": len(samples),
            "source_hashes": [r["sha256"] for r in samples],
            "outcome": result["outcome"],
            "sequence_eligible": result["sequence_eligible"],
            "selected_indices": result["selected_indices"],
            "frames": result["frames"],
            "pair_eligibility": result["pair_eligibility"],
            "output_count": len(files),
        }
        report["targets"].append(summary)
        print(
            target,
            len(samples),
            result["outcome"],
            "sequence eligible:",
            result["sequence_eligible"],
            flush=True,
        )
    (ROOT / "docs/verification/frame_preparation_report.json").write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
