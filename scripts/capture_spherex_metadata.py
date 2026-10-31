"""Capture bounded discovery metadata; never overwrite the reviewed Git fixture snapshots."""

import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode
from xml.etree import ElementTree

from astropy.io.votable import parse_single_table
from research_io import download, sha256

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FIELDS = {
    "obs_id",
    "access_url",
    "s_region",
    "t_min",
    "t_max",
    "energy_bandpassname",
}


def summarize(path):
    table = parse_single_table(path).to_table(use_names_over_ids=True)
    statuses = [
        element.attrib.get("value")
        for element in ElementTree.parse(path).getroot().iter()
        if element.tag.endswith("INFO") and element.attrib.get("name") == "QUERY_STATUS"
    ]
    if not statuses or any(status not in {"OK", "OVERFLOW"} for status in statuses):
        raise ValueError(f"SIA query failed or returned no status: {statuses}")
    if not set(table.colnames) >= REQUIRED_FIELDS:
        raise ValueError("SIA metadata contract changed")
    return {"rows": len(table), "query_status": statuses, "fields": table.colnames}


def main():
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    directory = ROOT / "var" / "research" / "captures" / stamp
    receipts = []
    for collection in ("spherex_qr2", "spherex_qr3"):
        url = "https://irsa.ipac.caltech.edu/SIA?" + urlencode(
            {
                "COLLECTION": collection,
                "POS": "CIRCLE 210.80227 54.34895 0.001",
                "MAXREC": 150,
            }
        )
        path = directory / f"m101_{collection}.xml"
        elapsed = download(url, path, maximum_bytes=8 * 1024 * 1024)
        receipts.append(
            {
                "url": url,
                "retrieved_at_utc": datetime.now(UTC).isoformat(),
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
                "elapsed_seconds": elapsed,
                **summarize(path),
            }
        )
    (directory / "receipts.json").write_text(
        json.dumps(receipts, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"directory": str(directory), "queries": receipts}, indent=2))


if __name__ == "__main__":
    main()
