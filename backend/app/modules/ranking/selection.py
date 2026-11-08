"""One containing native detector per predicted position and exposure. No pixel I/O."""

import csv
import io
import math
import time

import httpx

from app.modules.observations.discovery import deduplicate, footprint_intersects
from app.modules.observations.provider import REQUIRED, ProviderError, normalize_product
from app.modules.ranking.visits import exposure_id, midpoint
from app.modules.releases.registry import SOURCES

TAP_URL = "https://irsa.ipac.caltech.edu/TAP/sync"


def contains(product, ra, dec):
    try:
        return footprint_intersects(
            product,
            {
                "ra_deg": ra,
                "dec_deg": dec,
                "width_arcmin": 0,
                "height_arcmin": 0,
            },
        )
    except (ProviderError, KeyError, ValueError):
        return False


def at_epoch(product, epoch):
    return float(product["start_mjd"]) <= epoch <= float(product["end_mjd"])


def query_products(ra, dec, epoch, collection, deadline, *, transport=None):
    """Bounded ObsCore TAP point/time query; normalize with the discovery adapter."""
    if collection not in SOURCES or not all(math.isfinite(v) for v in (ra, dec, epoch)):
        raise ProviderError("invalid_ranker_product_query")
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ProviderError("ranker_wall_time_reached")
    columns = ",".join(sorted(REQUIRED))
    query = (
        f"SELECT TOP 40 {columns} FROM ivoa.obscore WHERE obs_collection='{collection}' "
        f"AND CONTAINS(POINT('ICRS',{ra:.12f},{dec:.12f}),s_region)=1 "
        f"AND t_min <= {epoch:.12f} AND t_max >= {epoch:.12f}"
    )
    try:
        with (
            httpx.Client(
                timeout=min(20, remaining), transport=transport, follow_redirects=False
            ) as client,
            client.stream(
                "GET",
                TAP_URL,
                params={
                    "QUERY": query,
                    "LANG": "ADQL",
                    "REQUEST": "doQuery",
                    "FORMAT": "csv",
                },
            ) as response,
        ):
            response.raise_for_status()
            body = bytearray()
            for chunk in response.iter_bytes():
                body.extend(chunk)
                if len(body) > 2 * 1024 * 1024 or time.monotonic() >= deadline:
                    raise ProviderError("ranker_product_query_budget")
        rows = list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
        if len(rows) >= 40:
            raise ProviderError("ranker_product_query_truncated")
        return [normalize_product(row, collection) for row in rows]
    except (httpx.HTTPError, UnicodeError, ValueError, KeyError) as exc:
        raise ProviderError("ranker_product_query_failed") from exc


def select_product(snapshot_products, exposure, prediction, deadline, *, query=query_products):
    ra, dec, epoch = prediction["ra"], prediction["dec"], prediction["mjd"]
    identity = exposure_id(exposure)
    choices = [
        p
        for p in snapshot_products
        if exposure_id(p) == identity and at_epoch(p, epoch) and contains(p, ra, dec)
    ]
    origin = "discovery_snapshot"
    if not choices:
        origin = "irsa_point_time_query"
        choices = [
            p
            for p in query(ra, dec, epoch, exposure["collection"], deadline)
            if exposure_id(p) == identity and at_epoch(p, epoch) and contains(p, ra, dec)
        ]
    # Latest processing choice per detector, then a deterministic single containing detector.
    choices = deduplicate(choices)
    choices.sort(key=lambda p: (p["detector"], p["id"]))
    return (choices[0], origin) if choices else (None, origin)


def spread(items, count):
    if len(items) <= count:
        return list(items)
    return [items[round(i * (len(items) - 1) / (count - 1))] for i in range(count)]


def candidate_exposures(candidate, products):
    """Join SkyBoT to mid-MJD (not nearest unrelated exposure or detector multiplicity)."""
    output, seen = [], set()
    for prediction in sorted(candidate["frames"], key=lambda f: f["mjd"]):
        for product in products:
            epoch = midpoint(product)
            key = exposure_id(product)
            if key not in seen and abs(epoch - float(prediction["mjd"])) <= 1e-9:
                seen.add(key)
                output.append(({**prediction, "mjd": epoch}, product))
                break
    return spread(output, 12)
