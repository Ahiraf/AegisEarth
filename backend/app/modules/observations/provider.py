"""Bounded SIA TABLEDATA adapter. No caller-supplied URLs or implicit schema fallbacks."""

import hashlib
import math
import re
import time
from datetime import UTC, datetime
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

import httpx
from astropy.time import Time

from app.modules.releases.registry import SIA_URL, SOURCES

MAX_ROWS = 40
MAX_BYTES = 2 * 1024 * 1024
REQUIRED = {
    "s_ra",
    "s_dec",
    "obs_id",
    "obs_publisher_did",
    "obs_collection",
    "access_url",
    "access_format",
    "energy_bandpassname",
    "t_min",
    "t_max",
    "em_min",
    "em_max",
    "s_region",
}
UNITS = {"s_ra": "deg", "s_dec": "deg", "t_min": "d", "t_max": "d", "em_min": "m", "em_max": "m"}


class ProviderError(Exception):
    """Safe upstream failure code."""


def safe_url(value, release):
    url = urlsplit(value)
    if (
        url.scheme != "https"
        or url.netloc != "irsa.ipac.caltech.edu"
        or url.query
        or url.fragment
        or url.username
        or url.password
        or not re.fullmatch(rf"/ibe/data/spherex/{release}/level2/[A-Za-z0-9_./-]+\.fits", url.path)
        or any(part in {".", ".."} for part in url.path.split("/"))
    ):
        raise ProviderError("unsafe_source_link")
    return value


def parse_response(body, collection, *, with_status=False):
    # Disallow DTD/entities even though ElementTree never fetches external resources.
    if len(body) > MAX_BYTES or b"<!DOCTYPE" in body.upper() or b"<!ENTITY" in body.upper():
        raise ProviderError("invalid_provider_document")
    try:
        root = ET.fromstring(body)
        ns = {"v": root.tag.split("}")[0].strip("{")}
        resources = root.findall("v:RESOURCE", ns)
        results = [r for r in resources if r.attrib.get("type") == "results"]
        if len(results) != 1:
            raise ProviderError("provider_schema_changed")
        resource = results[0]
        statuses = [
            i.attrib.get("value", "").upper()
            for i in resource.findall("v:INFO", ns)
            if i.attrib.get("name") == "QUERY_STATUS"
        ]
        if not statuses or any(s not in {"OK", "OVERFLOW"} for s in statuses):
            raise ProviderError("provider_query_failed")
        tables = resource.findall("v:TABLE", ns)
        if len(tables) != 1:
            raise ProviderError("provider_schema_changed")
        table = tables[0]
        fields = table.findall("v:FIELD", ns)
        names = [f.attrib.get("name") for f in fields]
        if len(set(names)) != len(names) or not set(names) >= REQUIRED:
            raise ProviderError("provider_schema_changed")
        units = {f.attrib.get("name"): f.attrib.get("unit") for f in fields}
        if any(units.get(name) != unit for name, unit in UNITS.items()):
            raise ProviderError("provider_units_changed")
        data = table.find("v:DATA/v:TABLEDATA", ns)
        if data is None:
            raise ProviderError("unsupported_provider_serialization")
        rows = data.findall("v:TR", ns)
        if len(rows) > MAX_ROWS:
            raise ProviderError("provider_row_limit_ignored")
        products = []
        for row in rows:
            values = [cell.text or "" for cell in row.findall("v:TD", ns)]
            if len(values) != len(names) or any(len(v) > 8192 for v in values):
                raise ProviderError("provider_schema_changed")
            record = dict(zip(names, values, strict=True))
            products.append(normalize_product(record, collection))
        truncated = "OVERFLOW" in statuses or len(rows) == MAX_ROWS
        return (products, truncated, statuses) if with_status else (products, truncated)
    except (ET.ParseError, ValueError, KeyError, TypeError, OverflowError) as exc:
        raise ProviderError("invalid_provider_document") from exc


def normalize_product(row, collection):
    source = SOURCES[collection]
    release = source["release"]
    detector_match = re.fullmatch(r"SPHEREx-(D[1-6])", row["energy_bandpassname"])
    if (
        row["obs_collection"] != collection
        or not detector_match
        or row["access_format"] != "image/fits"
        or not re.fullmatch(r"\d{4}W\d{2}_[A-Za-z0-9]+_\d+_\d+", row["obs_id"])
    ):
        raise ProviderError("provider_identity_changed")
    detector = detector_match[1]
    expected_did = f"ivo://irsa.ipac/{collection}?{row['obs_id']}/{detector}"
    if row["obs_publisher_did"] != expected_did:
        raise ProviderError("provider_identity_changed")
    url = safe_url(row["access_url"], release)
    if f"level2_{row['obs_id']}{detector}_spx_" not in url.rsplit("/", 1)[-1]:
        raise ProviderError("provider_identity_changed")
    values = {k: float(row[k]) for k in UNITS}
    if (
        not all(math.isfinite(v) for v in values.values())
        or not 0 <= values["s_ra"] < 360
        or not -90 <= values["s_dec"] <= 90
        or not 50000 < values["t_min"] <= values["t_max"] < 100000
        or not 0 < values["em_min"] <= values["em_max"] < 0.001
    ):
        raise ProviderError("invalid_provider_values")
    identity = f"spherex:{row['obs_id']}:{detector}"
    # Metadata content hash preserves changed provider records without overwriting historical products.
    import json

    product_id = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
    footprint = row["s_region"]
    if not re.fullmatch(r"POLYGON ICRS [0-9eE+.\- ]+", footprint):
        raise ProviderError("unsupported_footprint")
    return {
        "id": product_id,
        "exposure_key": identity,
        "provider_id": expected_did,
        "collection": collection,
        "release": release,
        "detector": detector,
        "ra_deg": values["s_ra"],
        "dec_deg": values["s_dec"],
        "start_mjd": row["t_min"],
        "end_mjd": row["t_max"],
        "time_scale": "UTC",
        "start_at_utc": Time(values["t_min"], format="mjd", scale="utc")
        .to_datetime(timezone=UTC)
        .isoformat(),
        "end_at_utc": Time(values["t_max"], format="mjd", scale="utc")
        .to_datetime(timezone=UTC)
        .isoformat(),
        "image_wavelength_min_um": values["em_min"] * 1e6,
        "image_wavelength_max_um": values["em_max"] * 1e6,
        "local_wavelength_um": None,
        "access_url": url,
        "footprint_icrs": footprint,
        "calibration_version": url.split("/")[-3],
        "doi": source["doi"],
        "source_metadata": row,
    }


class SIAProvider:
    def __init__(self, settings, *, transport=None, sleep=time.sleep):
        self.settings, self.transport, self.sleep = settings, transport, sleep

    def search(self, collection, params):
        params = {**params, "COLLECTION": collection, "MAXREC": MAX_ROWS}
        started = time.monotonic()
        with httpx.Client(
            timeout=httpx.Timeout(10, connect=5),
            follow_redirects=False,
            transport=self.transport,
            headers={"User-Agent": self.settings.provider_user_agent},
        ) as client:
            for attempt in range(2):
                try:
                    with client.stream("GET", SIA_URL, params=params) as response:
                        if response.status_code in {429, 502, 503, 504} and attempt == 0:
                            self.sleep(0.25)
                            continue
                        if response.status_code != 200:
                            raise ProviderError("provider_unavailable")
                        body = bytearray()
                        for chunk in response.iter_bytes(chunk_size=65536):
                            body.extend(chunk)
                            if len(body) > MAX_BYTES or time.monotonic() - started > 25:
                                raise ProviderError("provider_budget_exceeded")
                    products, truncated, statuses = parse_response(
                        bytes(body), collection, with_status=True
                    )
                    return products, {
                        "collection": collection,
                        "query_url": str(response.request.url),
                        "retrieved_at_utc": datetime.now(UTC).isoformat(),
                        "sha256": hashlib.sha256(body).hexdigest(),
                        "bytes": len(body),
                        "rows": len(products),
                        "truncated": truncated,
                        "status": "OVERFLOW_OR_CAP" if truncated else "OK",
                        "query_status": statuses,
                        "attempts": attempt + 1,
                    }
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt == 0:
                        self.sleep(0.25)
                        continue
                    raise ProviderError("provider_unavailable") from exc
                except httpx.HTTPError as exc:
                    raise ProviderError("provider_unavailable") from exc
        raise ProviderError("provider_unavailable")
