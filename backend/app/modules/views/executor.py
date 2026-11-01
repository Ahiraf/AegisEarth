"""Isolated acquisition child; no database access; uploads run under the same resource guard."""

import json
import sys
import time
from pathlib import Path

from app.core.config import Settings
from app.modules.artifacts.storage import StorageError, get_store
from app.modules.cutouts.acquisition import AcquisitionError, cutout_url, download, validate_fits
from app.modules.observations.provider import ProviderError


def execute(job, root):
    if job["config"].get("derived"):
        from app.modules.analyses.derived_executor import execute as execute_derived

        return execute_derived(job, root)
    total = 0
    limits = job["config"]["limits"]
    products = job["config"]["products"]
    if len(products) > 12:
        raise AcquisitionError("frame_limit_exceeded")
    raw_ids = []
    for index, product in enumerate(products):
        path = root / f"{index}.fits"
        receipt = download(
            cutout_url(
                product,
                job["config"]["region"],
                padding_arcmin=4 if job["config"].get("preparation") else 1,
            ),
            path,
            min(limits["per_file_bytes"], limits["total_bytes"] - total),
            expected=job.get("pins", {}).get(product["id"]),
        )
        total += receipt["size_bytes"]
        receipt.update(
            {
                "product_id": product["id"],
                "index": index,
                "validation": validate_fits(path, product, limits),
            }
        )
        temporary = root / f"{index}.json.part"
        temporary.write_text(json.dumps(receipt))
        temporary.replace(root / f"{index}.json")
        acknowledgment = root / f"{index}.upload.json"
        started = time.monotonic()
        while not acknowledgment.exists():
            if time.monotonic() - started > 60:
                raise AcquisitionError("upload_acknowledgment_timeout")
            time.sleep(0.1)
        record = json.loads(acknowledgment.read_text())
        get_store(Settings(_env_file=None, **job["storage"])).put(path, record)
        raw_ids.append(record["id"])
    if job["config"].get("preparation"):
        from app.modules.preprocessing.pipeline import prepare

        report, files = prepare(
            [root / f"{i}.fits" for i in range(len(products))],
            products,
            job["config"]["region"],
            raw_ids,
            job["config"]["preparation"],
            root,
        )
        payload = {"report": report, "files": files}
        pending = root / "preparation.part"
        pending.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
        pending.replace(root / "preparation.json")
        ack = root / "preparation.upload.json"
        started = time.monotonic()
        while not ack.exists():
            if time.monotonic() - started > 60:
                raise AcquisitionError("prepared_upload_acknowledgment_timeout")
            time.sleep(0.1)
        records = json.loads(ack.read_text(encoding="utf-8"))
        store = get_store(Settings(_env_file=None, **job["storage"]))
        for file in records:
            store.put(root / file["path"], file)


def main():
    root = Path(sys.argv[1]).resolve()
    job = json.loads((root / "job.json").read_text())
    result = {"ok": True}
    try:
        execute(job, root)
    except (AcquisitionError, ProviderError, StorageError) as exc:
        result = {"ok": False, "error_code": str(exc)}
    except (OSError, ValueError, KeyError, MemoryError):
        result = {"ok": False, "error_code": "acquisition_failed"}
    (root / "result.json").write_text(json.dumps(result))


if __name__ == "__main__":
    main()
