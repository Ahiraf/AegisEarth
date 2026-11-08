"""Trusted IRSA cutouts and structural validation; no registration/photometry claim."""

import hashlib
import math
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx
from astropy.io import fits

from app.modules.observations.provider import safe_url


class AcquisitionError(Exception):
    pass


def cutout_url(product, region, padding_arcmin=1):
    base = safe_url(product["access_url"], product["release"])
    # Enclose the requested TAN rectangle and reserve one arcminute for later reprojection kernels.
    radius = region["search_radius_deg"]
    size = 2 * radius + padding_arcmin / 60
    return (
        base
        + "?"
        + urlencode(
            {"center": f"{region['ra_deg']:.12f},{region['dec_deg']:.12f}", "size": f"{size:.12f}"}
        )
    )


def download(
    url,
    path,
    maximum,
    *,
    expected=None,
    transport=None,
    read_timeout=20,
    connect_timeout=5,
    deadline=None,
):
    path = Path(path)
    temporary = path.with_suffix(".part")
    started = time.monotonic()
    digest = hashlib.sha256()
    total = 0
    try:
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise AcquisitionError("ranker_wall_time_reached")
            read_timeout = min(read_timeout, remaining)
            connect_timeout = min(connect_timeout, remaining)
        with (
            httpx.Client(
                timeout=httpx.Timeout(read_timeout, connect=connect_timeout),
                follow_redirects=False,
                transport=transport,
                headers={"Accept-Encoding": "identity", "User-Agent": "AegisEarth/0.1"},
            ) as client,
            client.stream("GET", url) as response,
        ):
            if response.status_code != 200:
                raise AcquisitionError("source_unavailable")
            length = response.headers.get("Content-Length")
            if length is not None and (not length.isdigit() or int(length) > maximum):
                raise AcquisitionError("source_size_exceeded")
            if response.headers.get("Content-Encoding", "identity") != "identity":
                raise AcquisitionError("unsupported_content_encoding")
            with temporary.open("wb") as output:
                for chunk in response.iter_raw(chunk_size=65536):
                    if deadline is not None and time.monotonic() >= deadline:
                        raise AcquisitionError("ranker_wall_time_reached")
                    total += len(chunk)
                    if total > maximum or time.monotonic() - started > 120:
                        raise AcquisitionError("download_budget_exceeded")
                    digest.update(chunk)
                    output.write(chunk)
            if length is not None and total != int(length):
                raise AcquisitionError("truncated_source")
        if not total:
            raise AcquisitionError("empty_source")
        sha = digest.hexdigest()
        if expected and expected != sha:
            raise AcquisitionError("source_changed")
        temporary.replace(path)
        return {"sha256": sha, "size_bytes": total, "source_url": url}
    except httpx.HTTPError as exc:
        raise AcquisitionError("source_unavailable") from exc
    finally:
        temporary.unlink(missing_ok=True)


def validate_fits(path, product, limits):
    import warnings

    from astropy.utils.exceptions import AstropyWarning

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", AstropyWarning)
            with fits.open(
                path, memmap=False, lazy_load_hdus=True, ignore_missing_end=False
            ) as hdus:
                decoded = 0
                checksums = []
                for i, hdu in enumerate(hdus):
                    if i >= 16:
                        raise AcquisitionError("fits_hdu_limit")
                    header = hdu.header
                    axes = [
                        int(header.get(f"NAXIS{n}", 0))
                        for n in range(1, int(header.get("NAXIS", 0)) + 1)
                    ]
                    if len(axes) > 4 or any(n < 0 or n > 100000 for n in axes):
                        raise AcquisitionError("fits_dimensions_exceeded")
                    size = (math.prod(axes) if axes else 0) * abs(
                        int(header.get("BITPIX", 8))
                    ) // 8 + int(header.get("PCOUNT", 0))
                    decoded += size
                    if decoded > limits["max_decoded_bytes"]:
                        raise AcquisitionError("fits_decoded_limit")
                    info = hdu.fileinfo()
                    if info and info["datLoc"] + info["datSpan"] > Path(path).stat().st_size:
                        raise AcquisitionError("truncated_fits")
                    hdu.verify("exception")
                    if "CHECKSUM" in header and hdu.verify_checksum() != 1:
                        raise AcquisitionError("fits_checksum_failed")
                    if "DATASUM" in header and hdu.verify_datasum() != 1:
                        raise AcquisitionError("fits_checksum_failed")
                    checksums.append("CHECKSUM" in header)
                required = {
                    "IMAGE",
                    "VARIANCE",
                    "FLAGS",
                    "ZODI",
                    "WCS-WAVE",
                    "EPSF" if product["release"] == "qr3" else "PSF",
                }
                if not required <= {h.name for h in hdus}:
                    raise AcquisitionError("fits_missing_extensions")
                image = hdus["IMAGE"]
                shape = image.shape
                if (
                    len(shape) != 2
                    or min(shape) < 1
                    or max(shape) > limits["max_science_dimension"]
                ):
                    raise AcquisitionError("fits_science_dimensions_exceeded")
                if hdus["VARIANCE"].shape != shape or hdus["FLAGS"].shape != shape:
                    raise AcquisitionError("fits_grid_mismatch")
                if (
                    image.header.get("TIMESYS") != "UTC"
                    or image.header.get("OBSID") != product["exposure_key"].split(":")[1]
                    or int(image.header.get("DETECTOR", 0)) != int(product["detector"][1])
                ):
                    raise AcquisitionError("fits_identity_mismatch")
                if not image.header.get("CTYPE1", "").startswith("RA") or not image.header.get(
                    "CTYPE2", ""
                ).startswith("DEC"):
                    raise AcquisitionError("fits_wcs_missing")
                return {
                    "shape": list(shape),
                    "decoded_bytes": decoded,
                    "hdus": [h.name for h in hdus],
                    "fits_checksums_present": checksums,
                    "structurally_validated": True,
                    "science_eligibility": "not_evaluated",
                    "full_fov_coverage": "not_evaluated",
                }
    except AcquisitionError:
        raise
    except (
        ValueError,
        OSError,
        KeyError,
        TypeError,
        AstropyWarning,
        fits.verify.VerifyError,
    ) as exc:
        raise AcquisitionError("invalid_fits") from exc
