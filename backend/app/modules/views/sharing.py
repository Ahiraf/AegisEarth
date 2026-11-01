"""Versioned, credential-free coordinate URLs; frozen IDs retain a finite artifact lifetime."""

from typing import Literal
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from app.core.schemas import StrictRequest
from app.modules.views.schemas import PreparedViewRequest


class ShareState(StrictRequest):
    version: Literal["share-v1"] = "share-v1"
    request: PreparedViewRequest
    mode: Literal["common", "native"] = "common"


def request_from_canonical(canonical):
    region = canonical["region"]
    fields = {
        key: canonical[key]
        for key in (
            "start_at",
            "end_at",
            "collections",
            "detectors",
            "wavelength_min_um",
            "wavelength_max_um",
            "max_frames",
            "preparation",
        )
        if key in canonical
    }
    return PreparedViewRequest(
        contract_version="view-v2",
        region={
            "ra": region["ra_deg"],
            "dec": region["dec_deg"],
            "width_arcmin": region["width_arcmin"],
            "height_arcmin": region["height_arcmin"],
        },
        **fields,
    )


def normalize(state):
    data = state.model_dump(mode="json")
    region = state.request.region
    pos = region.normalized()
    data["request"]["region"] = {
        "ra": pos["ra_deg"],
        "dec": pos["dec_deg"],
        "width_arcmin": region.width_arcmin,
        "height_arcmin": region.height_arcmin,
        "frame": "icrs",
        "ra_unit": "deg",
        "dec_unit": "deg",
    }
    return ShareState.model_validate(data)


def encode(state):
    state = normalize(state)
    request = state.request
    region = request.region
    values = {
        "v": "1",
        "ra": region.ra,
        "dec": region.dec,
        "width": region.width_arcmin,
        "height": region.height_arcmin,
        "mode": state.mode,
        "max_frames": request.max_frames,
        "collections": ",".join(request.collections),
        "detectors": ",".join(request.detectors),
    }
    for name in ("start_at", "end_at", "wavelength_min_um", "wavelength_max_um"):
        value = getattr(request, name)
        if value is not None:
            values[name] = value.isoformat() if hasattr(value, "isoformat") else value
    values.update(
        {"p_" + k: v for k, v in request.preparation.model_dump().items() if v is not None}
    )
    return urlencode(values)


def decode(query):
    if len(query) > 4096:
        raise ValueError("share_query_too_long")
    values = parse_qs(query, keep_blank_values=True, max_num_fields=40)
    allowed = {
        "v",
        "ra",
        "dec",
        "width",
        "height",
        "mode",
        "max_frames",
        "collections",
        "detectors",
        "start_at",
        "end_at",
        "wavelength_min_um",
        "wavelength_max_um",
    }
    from app.modules.preprocessing.schemas import PreparationOptions

    allowed |= {"p_" + k for k in PreparationOptions.model_fields}
    if (
        set(values) - allowed
        or any(len(v) != 1 for v in values.values())
        or values.get("v") != ["1"]
    ):
        raise ValueError("unsupported_or_duplicate_share_parameters")
    flat = {k: v[0] for k, v in values.items()}
    required = {"ra", "dec", "width", "height"}
    if not required <= flat.keys():
        raise ValueError("missing_coordinate_fields")
    data = {
        "contract_version": "view-v2",
        "region": {
            "ra": float(flat["ra"]),
            "dec": float(flat["dec"]),
            "width_arcmin": flat["width"],
            "height_arcmin": flat["height"],
        },
        "preparation": {k[2:]: v for k, v in flat.items() if k.startswith("p_")},
    }
    for k in ("start_at", "end_at", "wavelength_min_um", "wavelength_max_um", "max_frames"):
        if k in flat:
            data[k] = flat[k]
    for k in ("collections", "detectors"):
        if k in flat:
            data[k] = flat[k].split(",") if flat[k] else []
    return normalize(
        ShareState(
            request=PreparedViewRequest.model_validate(data), mode=flat.get("mode", "common")
        )
    )


def viewer_url(base, query):
    parsed = urlsplit(base)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("frontend_viewer_url_requires_plain_http_base")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, query, ""))
