"""Rank follow-up downloads by footprint geometry; real FITS wavelengths remain authoritative."""

import itertools
import json
import sys
from pathlib import Path

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io.votable import parse_single_table

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.modules.targets.catalog import load_targets

OUTPUT = ROOT / "docs/research/target_feasibility"


def location(row, center):
    tokens = str(row["s_region"]).split()
    if tokens[:2] != ["POLYGON", "ICRS"] or len(tokens) not in (10, 12):
        raise ValueError("Expected four-corner ICRS footprint")
    vertices = np.asarray(list(map(float, tokens[2:]))).reshape(-1, 2)
    if len(vertices) == 5:
        if not np.allclose(vertices[0], vertices[-1]):
            raise ValueError("Unexpected non-closed footprint")
        vertices = vertices[:4]
    corners = SkyCoord(vertices[:, 0], vertices[:, 1], unit="deg")
    origin = SkyCoord(center["ra_deg"], center["dec_deg"], unit="deg")
    x, y = origin.spherical_offsets_to(corners)
    points = np.column_stack([x.deg, y.deg])
    matrix = np.column_stack([points[1] - points[0], points[3] - points[0]])
    return np.linalg.solve(matrix, -points[0])


def main():
    manifest = json.loads((OUTPUT / "cutouts_manifest.json").read_text())["cutouts"]
    captures = json.loads((OUTPUT / "discovery_report.json").read_text())["captures"]
    result = {}
    for target in load_targets():
        sample = next(item for item in manifest if item["target"] == target.slug)
        capture = next(
            item
            for item in captures
            if item["target"] == target.slug and item["collection"] == sample["collection"]
        )
        table = parse_single_table(ROOT / capture["snapshot_path"]).to_table(
            use_names_over_ids=True
        )
        detector = sample["source_metadata"]["energy_bandpassname"]
        rows = [row for row in table if str(row["energy_bandpassname"]) == detector]
        center = sample["fixed_sky_center"]
        pairs = []
        for a, b in itertools.combinations(rows, 2):
            dt = abs(float(a["t_min"]) - float(b["t_min"]))
            if dt < 1:
                continue
            distance = float(np.linalg.norm(location(a, center) - location(b, center)))
            pairs.append((distance, -dt, str(a["obs_id"]), str(b["obs_id"])))
        best = min(pairs)
        result[target.slug] = {
            "collection": sample["collection"],
            "observation_ids": list(best[2:]),
            "footprint_relative_distance": best[0],
            "separation_days": -best[1],
            "method": "footprint_heuristic_only_actual_wavelength_checks_required",
        }
        print(target.slug, result[target.slug])
    (OUTPUT / "followup_selection.json").write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
