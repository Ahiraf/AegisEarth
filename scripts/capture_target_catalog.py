"""Capture exact CDS/SIMBAD identities and per-object epoch evidence; explicitly rebuild catalog."""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/research/target_feasibility"
ENDPOINT = "https://simbad.cfa.harvard.edu/simbad/"
TARGETS = (
    ("barnards-star", "Barnard's Star", "NAME Barnard's star"),
    ("epsilon-indi-b", "Epsilon Indi B", "* eps Ind B"),
    ("wise-0855", "WISE 0855", "WISEA J085510.74-071442.5"),
    ("rw-aurigae", "RW Aurigae", "V* RW Aur"),
    ("r-draconis", "R Draconis", "V* R Dra"),
)


def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": "AegisEarth/0.1"}), timeout=30) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("Catalog response exceeded cap")
    return raw


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    query = """SELECT TOP 40 i.id AS matched_id,b.main_id,b.ra,b.dec,b.coo_err_maj,b.coo_err_min,
    b.coo_bibcode,b.pmra,b.pmdec,b.pm_err_maj,b.pm_err_min,b.pm_bibcode,b.plx_value,b.plx_bibcode
    FROM basic b JOIN ident i ON b.oid=i.oidref WHERE i.id IN
    ('NAME Barnard''s star','* eps Ind B','* eps Ind','WISE J085510.83-071442.5','V* RW Aur','V* R Dra')"""
    url = (
        ENDPOINT
        + "sim-tap/sync?"
        + urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "QUERY": query})
    )
    raw = fetch(url)
    data = json.loads(raw)
    rows = [
        dict(zip([column["name"] for column in data["metadata"]], row, strict=True))
        for row in data["data"]
    ]
    by_id = {row["main_id"]: row for row in rows}
    if any(canonical not in by_id for _, _, canonical in TARGETS):
        raise ValueError("Target identity changed or is missing; review before replacing catalog")
    receipt = {
        "url": url,
        "retrieved_at_utc": datetime.now(UTC).isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "rows": rows,
        "metadata": data["metadata"],
    }
    (OUTPUT / "simbad_response.json").write_bytes(raw)
    (OUTPUT / "astrometry_receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    targets = []
    for slug, name, canonical in TARGETS:
        epoch_url = ENDPOINT + "sim-id?" + urlencode({"Ident": canonical, "output.format": "ASCII"})
        epoch_raw = fetch(epoch_url)
        if "Coordinates(ICRS,ep=J2000,eq=2000)" not in epoch_raw.decode(errors="replace"):
            raise ValueError(
                "Expected coordinate epoch evidence missing; no epoch assumption allowed"
            )
        epoch_file = OUTPUT / "catalog" / (slug + ".txt")
        epoch_file.parent.mkdir(exist_ok=True)
        epoch_file.write_bytes(epoch_raw)
        epoch_file.with_suffix(".json").write_text(
            json.dumps(
                {
                    "url": epoch_url,
                    "retrieved_at_utc": datetime.now(UTC).isoformat(),
                    "sha256": hashlib.sha256(epoch_raw).hexdigest(),
                },
                indent=2,
            )
            + "\n"
        )
        row = by_id[canonical]
        targets.append(
            {
                "slug": slug,
                "name": name,
                "canonical_id": canonical,
                "ra_deg": row["ra"],
                "dec_deg": row["dec"],
                "reference_epoch_jyear": 2000.0,
                "pm_ra_cosdec_mas_yr": row["pmra"],
                "pm_dec_mas_yr": row["pmdec"],
                "astrometry": row,
                "source_receipt": "docs/research/target_feasibility/astrometry_receipt.json",
                "supplied_coordinate": {
                    "ra_sexagesimal": "08h55m10.831s",
                    "dec_sexagesimal": "-07d14m42.53s",
                    "reference_epoch": None,
                }
                if slug == "wise-0855"
                else None,
                "caveats": [
                    "Catalog prediction is a search aid, not SPHEREx astrometry",
                    "No parallax/observer-position or radial-velocity correction in search estimate",
                ]
                + (
                    [
                        "Brown-dwarf system B selected, distinct from primary eps Ind; Ba/Bb may be unresolved"
                    ]
                    if slug == "epsilon-indi-b"
                    else []
                ),
            }
        )
        print("Verified", name, "epoch J2000", flush=True)
    catalog = {
        "version": "2026-10-29",
        "epoch_evidence": "docs/research/target_feasibility/catalog/",
        "targets": targets,
    }
    (ROOT / "backend/app/modules/targets/catalog.json").write_text(
        json.dumps(catalog, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
