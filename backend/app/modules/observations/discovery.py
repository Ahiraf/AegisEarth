import hashlib
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import numpy as np
from astropy.time import Time

from app.modules.observations.provider import ProviderError
from app.modules.observations.repository import check_size
from app.modules.releases.registry import REGISTRY_VERSION, SOURCES

# Two simultaneous cache misses per API process; each uses at most two archive connections.
SEARCH_SLOTS = threading.BoundedSemaphore(2)
TTL_SECONDS = 900


class DiscoveryBusy(Exception):
    pass


def footprint_intersects(product, geometry):
    tokens = product["footprint_icrs"].split()[2:]
    if len(tokens) not in {8, 10}:
        raise ProviderError("unsupported_footprint")
    coords = np.array(tokens, dtype=float).reshape(-1, 2)
    if not np.isfinite(coords).all() or np.any(np.abs(coords[:, 1]) > 90):
        raise ProviderError("unsupported_footprint")
    ra0, dec0 = np.deg2rad([geometry["ra_deg"], geometry["dec_deg"]])
    ra, dec = np.deg2rad(coords).T
    denom = np.sin(dec0) * np.sin(dec) + np.cos(dec0) * np.cos(dec) * np.cos(ra - ra0)
    if np.any(denom <= 0):
        raise ProviderError("unsupported_footprint")
    polygon = np.column_stack(
        (
            np.cos(dec) * np.sin(ra - ra0) / denom,
            (np.cos(dec0) * np.sin(dec) - np.sin(dec0) * np.cos(dec) * np.cos(ra - ra0)) / denom,
        )
    )
    if len(polygon) == 5:
        if not np.allclose(polygon[0], polygon[-1], atol=1e-10):
            raise ProviderError("unsupported_footprint")
        polygon = polygon[:-1]
    # TAN maps great-circle footprint edges to lines. Separating-axis test for convex quadrilateral.
    edges = np.roll(polygon, -1, axis=0) - polygon
    following = np.roll(edges, -1, axis=0)
    crosses = edges[:, 0] * following[:, 1] - edges[:, 1] * following[:, 0]
    if not (np.all(crosses > 0) or np.all(crosses < 0)):
        raise ProviderError("unsupported_footprint")
    x, y = np.tan(np.deg2rad([geometry["width_arcmin"] / 120, geometry["height_arcmin"] / 120]))
    rectangle = np.array([[-x, -y], [x, -y], [x, y], [-x, y]])
    axes = [np.array([1, 0]), np.array([0, 1]), *[np.array([-e[1], e[0]]) for e in edges]]
    for axis in axes:
        a, b = polygon @ axis, rectangle @ axis
        if a.max() < b.min() - 1e-12 or b.max() < a.min() - 1e-12:
            return False
    return True


def canonical_query(query):
    return {
        "contract_version": "discovery-v1",
        "registry_version": REGISTRY_VERSION,
        "region": query.region.geometry(),
        "start_at": query.start_at.astimezone(UTC).isoformat() if query.start_at else None,
        "end_at": query.end_at.astimezone(UTC).isoformat() if query.end_at else None,
        "collections": sorted(query.collections),
        "detectors": sorted(query.detectors),
        "wavelength_min_um": query.wavelength_min_um,
        "wavelength_max_um": query.wavelength_max_um,
    }


def deduplicate(products):
    groups = {}
    for product in products:
        groups.setdefault(product["exposure_key"], {})[product["id"]] = product
    selected = []
    for group in groups.values():

        def preference(product):
            version = re.search(r"l2b-v(\d+)-(\d{4}-\d{3})", product["calibration_version"])
            return (
                SOURCES[product["collection"]]["priority"],
                int(version[1]) if version else -1,
                version[2] if version else "",
                product["id"],
            )

        ordered = sorted(group.values(), key=preference, reverse=True)
        selected.append({**ordered[0], "alternate_product_ids": [p["id"] for p in ordered[1:]]})
    return sorted(selected, key=lambda p: (float(p["start_mjd"]), p["exposure_key"], p["id"]))


class DiscoveryService:
    def __init__(
        self, repository, provider, *, now=lambda: datetime.now(UTC), ttl_seconds=TTL_SECONDS
    ):
        self.repository, self.provider, self.now = repository, provider, now
        self.ttl_seconds = ttl_seconds

    def search(self, query, *, force=False):
        canonical = canonical_query(query)
        key = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
        cached = self.repository.find(query_hash=key)
        if (
            not force
            and cached
            and self.now() < datetime.fromisoformat(cached["revalidate_after_utc"])
        ):
            return self.page(cached, 0, query.limit, cache_hit=True)
        if not SEARCH_SLOTS.acquire(blocking=False):
            raise DiscoveryBusy
        try:
            snapshot, products = self.discover(canonical, key)
            check_size(snapshot, products)
            self.repository.save(snapshot, products)
            return self.page(snapshot, 0, query.limit, cache_hit=False)
        finally:
            SEARCH_SLOTS.release()

    def discover(self, canonical, key):
        geometry = canonical["region"]
        params = {
            "POS": f"CIRCLE {geometry['ra_deg']:.12f} {geometry['dec_deg']:.12f} {geometry['search_radius_deg']:.12f}"
        }
        if canonical["start_at"]:
            params["TIME"] = " ".join(
                str(float(Time(datetime.fromisoformat(canonical[k])).mjd))
                for k in ("start_at", "end_at")
            )
        if canonical["wavelength_min_um"] is not None:
            params["BAND"] = (
                f"{canonical['wavelength_min_um'] * 1e-6:.12g} {canonical['wavelength_max_um'] * 1e-6:.12g}"
            )

        def fetch(collection):
            try:
                return self.provider.search(collection, params)
            except ProviderError as exc:
                return [], {
                    "collection": collection,
                    "status": "unavailable",
                    "error": str(exc),
                    "truncated": True,
                }

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(fetch, canonical["collections"]))
        if all(receipt["status"] == "unavailable" for _, receipt in results):
            raise ProviderError("all_sources_unavailable")
        products, receipts = [], []
        for rows, receipt in results:
            receipts.append(receipt)
            for product in rows:
                if canonical["detectors"] and product["detector"] not in canonical["detectors"]:
                    continue
                if canonical["start_at"] and (
                    datetime.fromisoformat(product["end_at_utc"])
                    < datetime.fromisoformat(canonical["start_at"])
                    or datetime.fromisoformat(product["start_at_utc"])
                    > datetime.fromisoformat(canonical["end_at"])
                ):
                    continue
                if canonical["wavelength_min_um"] is not None and (
                    product["image_wavelength_max_um"] < canonical["wavelength_min_um"]
                    or product["image_wavelength_min_um"] > canonical["wavelength_max_um"]
                ):
                    continue
                if footprint_intersects(product, geometry):
                    products.append(product)
        products = list({p["id"]: p for p in products}.values())
        items = deduplicate(products)
        complete = not any(r["truncated"] for r in receipts)
        warnings = [
            "Image wavelength bounds are whole-detector bounds, not local wavelength at the requested sky patch",
            "Footprint intersection does not establish usable-pixel or full-FOV coverage; FITS masks/WCS required",
            "SIA may lag new archive ingestion by about one day; reported gaps are not proof of no observations",
        ]
        if not complete:
            warnings.append(
                "Incomplete archive sample: narrow dates/FOV or select collections; pagination cannot recover upstream omitted rows"
            )
        now = self.now()
        intervals = [
            {
                "start_at_utc": p["start_at_utc"],
                "end_at_utc": p["end_at_utc"],
                "detector": p["detector"],
            }
            for p in items
        ]
        availability = {
            "scope": "returned_sample" if not complete else "queried_SIA_collections_at_retrieval",
            "epoch_intervals": intervals,
            "detectors": sorted({p["detector"] for p in items}),
            "earliest_at_utc": min((p["start_at_utc"] for p in items), default=None),
            "latest_at_utc": max((p["end_at_utc"] for p in items), default=None),
            "local_spectral_coverage": "requires_FITS_WCS_WAVE",
            "outcome": "incomplete" if not complete else ("no_data" if not items else "available"),
        }
        gaps = []
        covered_until = None
        for product in items:
            start = datetime.fromisoformat(product["start_at_utc"])
            end = datetime.fromisoformat(product["end_at_utc"])
            if covered_until and start > covered_until:
                gaps.append(
                    {
                        "start_at_utc": covered_until.isoformat(),
                        "end_at_utc": start.isoformat(),
                        "seconds": (start - covered_until).total_seconds(),
                    }
                )
            covered_until = max(covered_until, end) if covered_until else end
        availability["sample_time_gaps"] = gaps
        availability["image_spectral_ranges_um"] = [
            {
                "detector": detector,
                "min": min(
                    p["image_wavelength_min_um"] for p in items if p["detector"] == detector
                ),
                "max": max(
                    p["image_wavelength_max_um"] for p in items if p["detector"] == detector
                ),
            }
            for detector in availability["detectors"]
        ]
        snapshot = {
            "id": str(uuid4()),
            "query_hash": key,
            "registry_version": REGISTRY_VERSION,
            "canonical_query": canonical,
            "created_at_utc": now.isoformat(),
            "revalidate_after_utc": (now + timedelta(seconds=self.ttl_seconds)).isoformat(),
            "upstream_complete": complete,
            "items": [{k: v for k, v in p.items() if k != "source_metadata"} for p in items],
            "sources": receipts,
            "availability": availability,
            "warnings": warnings,
        }
        return snapshot, products

    def page(self, snapshot, offset, limit, *, cache_hit=True):
        count = len(snapshot["items"])
        if offset > count:
            raise LookupError("page_not_found")
        # Raw provider metadata is available through product detail; keep public pages compact.
        items = [
            {k: v for k, v in p.items() if k != "source_metadata"}
            for p in snapshot["items"][offset : offset + limit]
        ]
        return {
            **{k: v for k, v in snapshot.items() if k not in {"id", "query_hash", "items"}},
            "contract_version": "discovery-v1",
            "snapshot_id": snapshot["id"],
            "cache_hit": cache_hit,
            "stale": self.now() >= datetime.fromisoformat(snapshot["revalidate_after_utc"]),
            "total": count if snapshot["upstream_complete"] else None,
            "sampled_count": count,
            "offset": offset,
            "limit": limit,
            "items": items,
            "next_page": f"/api/v1/observations/snapshots/{snapshot['id']}?offset={offset + limit}&limit={limit}"
            if offset + limit < count
            else None,
        }
