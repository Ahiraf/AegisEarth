"""Load verified researcher code lazily, outside the viewer's import path."""

import hashlib
import importlib
import json
from functools import lru_cache
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[3] / "model_packages" / "aegis_ranker_v2"
MODEL_SHA256 = "2171854d7a66868188d0765bb33b53e4396d75259bfe64651e1326efa7b72b37"
MODEL_VERSION = "ranker_AB_v3"


@lru_cache(maxsize=1)
def load_package():
    manifest = json.loads((PACKAGE / "MANIFEST.json").read_text())
    for name in (
        "aegis_ranker/__init__.py",
        "aegis_ranker/features.py",
        "aegis_ranker/candidates.py",
        "ranker_AB_v3.json",
    ):
        if (
            hashlib.sha256((PACKAGE / name).read_bytes()).hexdigest()
            != manifest["files"][name]["sha256"]
        ):
            raise ValueError("metadata_ranker_package_checksum_mismatch")
    if manifest["files"]["ranker_AB_v3.json"]["sha256"] != MODEL_SHA256:
        raise ValueError("metadata_ranker_model_checksum_mismatch")
    features = importlib.import_module("model_packages.aegis_ranker_v2.aegis_ranker.features")
    candidates = importlib.import_module("model_packages.aegis_ranker_v2.aegis_ranker.candidates")
    return features, candidates, features.load_model(PACKAGE / "ranker_AB_v3.json")


def available():
    try:
        importlib.import_module("astroquery.imcce")
        importlib.import_module("pandas")
        load_package()
    except (ImportError, OSError, ValueError, KeyError):
        return False
    return True
