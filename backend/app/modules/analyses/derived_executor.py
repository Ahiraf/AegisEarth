"""Isolated derived executor; reads only hash-verified committed artifacts, never user URLs."""

import hashlib
import json
import shutil
import time

import numpy as np
from astropy.io import fits

from app.core.config import Settings
from app.modules.artifacts.storage import get_store
from app.modules.coadds.pipeline import coadds
from app.modules.differencing.pipeline import differences
from app.modules.preprocessing.pipeline import json_safe
from app.modules.spectra.pipeline import spectra


def publish_receipt(root, name, payload):
    path = root / (name + ".part")
    path.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
    path.replace(root / name)


def await_ack(root, name):
    start = time.monotonic()
    while not (root / name).exists():
        if time.monotonic() - start > 60:
            raise ValueError("Upload acknowledgment timed out")
        time.sleep(0.1)
    return json.loads((root / name).read_text(encoding="utf-8"))


def read_planes(path):
    with fits.open(path, memmap=False) as h:
        if h["SCIENCE"].data.ndim != 2 or max(h["SCIENCE"].shape) > 512:
            raise ValueError("Grid exceeds bound")
        return {
            k: np.array(h[n].data, dtype=bool if k == "valid" else float)
            for k, n in (
                ("science", "SCIENCE"),
                ("variance", "VARIANCE"),
                ("valid", "VALID"),
                ("wavelength", "WAVELENGTH"),
                ("bandwidth", "BANDWIDTH"),
            )
        }


def execute(job, root):
    config = job["config"]
    sources = config["sources"]
    store = get_store(Settings(_env_file=None, **job["storage"]))
    files = []
    raws = []
    frames = []
    total = 0

    def artifact(path, kind, ids):
        files.append(
            {
                "path": path.name,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "size_bytes": path.stat().st_size,
                "kind": kind,
                "source_product_ids": ids,
                "content_type": {
                    "fits": "application/fits",
                    "png": "image/png",
                    "csv": "text/csv",
                    "json": "application/json",
                    "gif": "image/gif",
                }[path.suffix[1:]],
            }
        )
        return len(files) - 1

    for i, source in enumerate(sources):
        raw = root / f"{i}.fits"
        with store.open_verified(source["raw"]) as stream, raw.open("wb") as out:
            shutil.copyfileobj(stream, out, 65536)
        total += raw.stat().st_size
        raws.append(raw)
        receipt = {
            k: v
            for k, v in source["raw"].items()
            if k in ("product_id", "sha256", "size_bytes", "source_url", "validation")
        }
        receipt["index"] = i
        publish_receipt(root, f"{i}.json", receipt)
        record = await_ack(root, f"{i}.upload.json")
        store.put(raw, record)
        plane = root / f"input_{i}.fits"
        with store.open_verified(source["planes"]) as stream, plane.open("wb") as out:
            shutil.copyfileobj(stream, out, 65536)
        total += plane.stat().st_size
        if total > config["limits"]["total_bytes"] // 2:
            raise ValueError("Derived input budget exceeded")
        frames.append(read_planes(plane))
        artifact(plane, "source_common_grid", [source["metadata"]["product_id"]])
    kind = config["derived"]["kind"]
    query = config["derived"]["request"]
    if kind == "coadd":
        result = coadds(frames, sources, query, config["grid"], root, artifact)
    elif kind == "difference":
        result = differences(frames, sources, config["grid"], root, artifact)
    elif kind == "spectrum":
        result = spectra(raws, sources, query, root, artifact)
    elif kind == "export":
        from app.modules.artifacts.export_pipeline import export_movie

        result = export_movie(frames, sources, query, root, artifact)
    else:
        raise ValueError("Unsupported derived operation")
    report = json_safe(
        {
            "version": "derived-v1",
            "processing_version": config["derived"]["processing_version"],
            "kind": kind,
            "request": query,
            "parent_preparation_sha256": config["derived"]["parent_preparation_sha256"],
            "inputs": [
                {
                    "ref": s["ref"],
                    "product_id": s["metadata"]["product_id"],
                    "raw_sha256": s["raw"]["sha256"],
                    "grid_sha256": s["planes"]["sha256"],
                    "registration": s["metadata"]["registration"],
                    "psf": s["metadata"]["psf"],
                }
                for s in sources
            ],
            **result,
        }
    )
    path = root / "derived_report.json"
    path.write_text(json.dumps(report, allow_nan=False), encoding="utf-8")
    artifact(path, "derived_report", [s["metadata"]["product_id"] for s in sources])
    publish_receipt(root, "preparation.json", {"report": report, "files": files})
    records = await_ack(root, "preparation.upload.json")
    for file in records:
        store.put(root / file["path"], file)
