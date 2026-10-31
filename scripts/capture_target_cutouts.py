"""Download a bounded set of actual native cutouts for each target, with pinned receipts."""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

from astropy.io import fits
from astropy.io.votable import parse_single_table
from research_io import download, sha256

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.modules.targets.catalog import load_targets

OUTPUT = ROOT / "docs/research/target_feasibility"


def main():
    receipts = []
    discovery = json.loads((OUTPUT / "discovery_report.json").read_text())["captures"]
    for target in load_targets():
        captures = [
            capture
            for capture in discovery
            if capture["target"] == target.slug and capture.get("rows", 0)
        ]
        capture = min(
            captures,
            key=lambda item: (
                "qr3" not in item["collection"],
                "deep" in item["collection"],
            ),
        )
        table = parse_single_table(ROOT / capture["snapshot_path"]).to_table(
            use_names_over_ids=True
        )
        desired = "SPHEREx-D6" if target.slug in ("wise-0855", "epsilon-indi-b") else "SPHEREx-D2"
        available = {str(value) for value in table["energy_bandpassname"]}
        if desired not in available:
            desired = next(
                band for band in ("SPHEREx-D1", "SPHEREx-D4", "SPHEREx-D6") if band in available
            )
        rows = sorted(
            [row for row in table if str(row["energy_bandpassname"]) == desired],
            key=lambda row: float(row["t_min"]),
        )
        if not rows:
            raise ValueError(f"No {desired} in bounded sample for {target.slug}")
        # Sample separated epochs plus intermediate candidates for local-wavelength compatibility.
        indices = sorted({0, len(rows) // 3, 2 * len(rows) // 3, len(rows) - 1})
        followup_path = OUTPUT / "followup_selection.json"
        if followup_path.exists():
            followup = json.loads(followup_path.read_text())[target.slug]["observation_ids"]
            indices = sorted(
                set(indices) | {i for i, row in enumerate(rows) if str(row["obs_id"]) in followup}
            )
        center = target.search_position("2026-01-01T00:00:00")
        for index in indices:
            row = rows[index]
            url = str(row["access_url"])
            if not url.startswith("https://irsa.ipac.caltech.edu/ibe/data/spherex/"):
                raise ValueError(
                    "Expected a direct archive image; DataLink resolution must be explicit"
                )
            url += "?" + urlencode(
                {
                    "center": f"{center['ra_deg']},{center['dec_deg']}deg",
                    "size": "3arcmin",
                    "gzip": "false",
                }
            )
            filename = f"{target.slug}_{row['obs_id']!s}_{desired[-2:]}.fits"
            path = ROOT / "var/research/targets/cutouts" / filename
            receipt_path = OUTPUT / "cutouts" / (filename + ".json")
            if receipt_path.exists() and path.exists():
                saved = json.loads(receipt_path.read_text())
                if sha256(path) == saved["sha256"]:
                    receipts.append(saved)
                    continue
            elapsed = download(url, path, maximum_bytes=128 * 1024 * 1024)
            saved = {
                "target": target.slug,
                "collection": capture["collection"],
                "url": url,
                "retrieved_at_utc": datetime.now(UTC).isoformat(),
                "elapsed_seconds": elapsed,
                "local_path": path.relative_to(ROOT).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "fixed_sky_center": center,
                "source_metadata": {key: str(row[key]) for key in table.colnames},
            }
            with fits.open(path, memmap=False) as hdus:
                print(
                    target.slug,
                    str(row["obs_id"]),
                    [(h.name, None if h.data is None else h.data.shape) for h in hdus],
                    flush=True,
                )
            receipt_path.parent.mkdir(parents=True, exist_ok=True)
            receipt_path.write_text(json.dumps(saved, indent=2) + "\n")
            receipts.append(saved)
    (OUTPUT / "cutouts_manifest.json").write_text(
        json.dumps({"cutouts": receipts}, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
