"""Survey context in a movie's explicit sky grid; predictions never become SPHEREx detections."""

import hashlib
import io
import math
import threading
import time
import warnings
from collections import OrderedDict
from datetime import UTC, datetime

import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from PIL import Image
from scipy.ndimage import map_coordinates

from app.modules.overlays.provider import TAP, OverlayUnavailable

SLOTS = threading.BoundedSemaphore(2)
CACHE = OrderedDict()
LOCK = threading.Lock()


def cached(key, loader, ttl):
    now = time.monotonic()
    with LOCK:
        entry = CACHE.get(key)
        if entry and entry[0] > now:
            CACHE.move_to_end(key)
            return entry[1], True
    if not SLOTS.acquire(blocking=False):
        raise OverlayUnavailable("overlay_busy")
    try:
        value = loader()
        with LOCK:
            CACHE[key] = (now + ttl, value)
            # Bounded process-local cache: up to 16 image/metadata entries, expires on restart.
            while len(CACHE) > 16:
                CACHE.popitem(last=False)
        return value, False
    finally:
        SLOTS.release()


def number(row, key):
    try:
        value = float(row[key])
        return value if math.isfinite(value) else None
    except (ValueError, TypeError, KeyError):
        return None


def locate(ra, dec, spatial):
    wcs = WCS(fits.Header.fromstring(spatial["wcs_header"], sep="\n")).celestial
    x, y = map(float, wcs.world_to_pixel_values(ra, dec))
    height, width = spatial["shape"]
    finite = math.isfinite(x) and math.isfinite(y)
    return {
        "x_fits": x if finite else None,
        "y_fits": y if finite else None,
        "x_png": x if finite else None,
        "y_png": height - 1 - y if finite else None,
        "inside": bool(finite and -0.5 <= x < width - 0.5 and -0.5 <= y < height - 0.5),
        "origin": "zero_based_pixel_centers",
    }


def marker(row, survey, spatial, epoch, propagate):
    ra, dec = number(row, "ra"), number(row, "dec")
    if ra is None or dec is None or not 0 <= ra < 360 or abs(dec) > 90:
        raise OverlayUnavailable("invalid_catalog_position")
    position = {"ra_deg": ra, "dec_deg": dec}
    status = "catalog_position"
    ref = number(row, "ref_epoch") if survey == "gaia" else None
    pmra, pmdec = number(row, "pmra"), number(row, "pmdec")
    if (
        survey == "gaia"
        and propagate
        and ref is not None
        and pmra is not None
        and pmdec is not None
    ):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            sky = SkyCoord(
                ra=ra * u.deg,
                dec=dec * u.deg,
                pm_ra_cosdec=pmra * u.mas / u.yr,
                pm_dec=pmdec * u.mas / u.yr,
                obstime=Time(ref, format="jyear", scale="tcb"),
            )
            predicted = sky.apply_space_motion(new_obstime=Time(epoch, scale="utc"))
        position = {"ra_deg": float(predicted.ra.deg), "dec_deg": float(predicted.dec.deg)}
        status = "linear_proper_motion_prediction_no_parallax_or_radial_velocity"
    elif survey == "gaia" and propagate:
        status = "unpropagated_missing_astrometry"
    return {
        "id": str(row["source_id" if survey == "gaia" else "designation"]),
        "survey": "Gaia DR3" if survey == "gaia" else "AllWISE",
        "catalog_position": {"ra_deg": ra, "dec_deg": dec},
        "display_position": position,
        "reference_epoch_jyear_tcb": ref,
        "frame_epoch_utc": epoch,
        "position_status": status,
        "pmra_convention": "mu_alpha_cos_delta_mas_per_year" if survey == "gaia" else None,
        "catalog_fields": row,
        "pixel": locate(position["ra_deg"], position["dec_deg"], spatial),
        "spherex_detection": False,
        "warnings": [
            "Catalog context is not a SPHEREx detection or an association",
            "Catalog errors are retained in native units; propagated position errors are not evaluated",
            "No observer-dependent annual parallax correction is applied",
        ],
    }


def catalogs(provider, payload, mode, ordinal, survey, limit, propagate):
    frame = payload["frames"][mode][ordinal]
    region = payload["request"]["region"]
    epoch = frame["time"]["label_utc"]
    # Include possible movers crossing into the field; finite padding cannot promise completeness.
    years = abs(float(Time(epoch).tcb.jyear) - 2016) if survey == "gaia" else 0
    radius = min(1.5, region["search_radius_deg"] + min(years, 50) * 60 / 3600)
    rows, truncated, raw = provider.catalog(
        survey, region["ra_deg"], region["dec_deg"], radius, limit
    )
    markers = [marker(row, survey, frame["spatial"], epoch, propagate) for row in rows]
    return {
        "survey": survey,
        "status": "ready" if rows else "empty",
        "markers": markers,
        "retrieved_at_utc": datetime.now(UTC).isoformat(),
        "truncated": truncated,
        "query_radius_deg": radius,
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "endpoint": TAP,
        "catalog_ordering": "IRSA TAP DISTANCE alias catalog_distance_arcsec; native catalog position, not propagated distance",
        "catalog_field_units": {
            "ra": "deg",
            "dec": "deg",
            "ra_error": "mas",
            "dec_error": "mas",
            "pmra": "mas/yr (cos(dec) included)",
            "pmdec": "mas/yr",
            "pmra_error": "mas/yr",
            "pmdec_error": "mas/yr",
            "parallax": "mas",
            "ref_epoch": "Julian year TCB",
            "phot_g_mean_mag": "mag",
        }
        if survey == "gaia"
        else {
            "ra": "deg",
            "dec": "deg",
            "sigra": "arcsec",
            "sigdec": "arcsec",
            "w1mpro": "mag",
            "w2mpro": "mag",
            "w1sigmpro": "mag",
            "w2sigmpro": "mag",
            "w1mjdmin": "MJD UTC",
            "w1mjdmax": "MJD UTC",
            "w1mjdmean": "MJD UTC",
            "w2mjdmin": "MJD UTC",
            "w2mjdmax": "MJD UTC",
            "w2mjdmean": "MJD UTC",
        },
        "table": "gaia_dr3_source" if survey == "gaia" else "allwise_p3as_psd",
        "credits": "Gaia ESA/DPAC, distributed by NASA/IPAC IRSA"
        if survey == "gaia"
        else "WISE/NEOWISE, NASA/JPL-Caltech/UCLA, NASA/IPAC IRSA",
        "warnings": [
            "Finite proper-motion padding and capped source count do not ensure complete associations",
            "AllWISE W1/W2 MJD minima/maxima/means are separate per-band coadd time spans; no single common epoch is inferred",
        ],
    }


def image_layer(provider, payload, mode, ordinal, band):
    frame = payload["frames"][mode][ordinal]
    region = payload["request"]["region"]
    size = min(44.0, math.hypot(region["width_arcmin"], region["height_arcmin"]) + 1)
    data, source, source_url = provider.wise_image(region["ra_deg"], region["dec_deg"], band, size)
    with fits.open(io.BytesIO(data), memmap=False) as hdus:
        native = hdus[0].data
        if native is None or native.ndim != 2 or max(native.shape) > 2100:
            raise OverlayUnavailable("wise_image_bound_or_schema")
        native = np.asarray(native, float)
        source_wcs = WCS(hdus[0].header).celestial
        spatial = frame["spatial"]
        h, w = spatial["shape"]
        if max(h, w) > 512:
            raise OverlayUnavailable("output_grid_bound")
        target_header = fits.Header.fromstring(spatial["wcs_header"], sep="\n")
        target = WCS(target_header).celestial
        yy, xx = np.indices((h, w), dtype=float)
        sky = target.pixel_to_world_values(xx, yy)
        sx, sy = source_wcs.world_to_pixel_values(*sky)
        mapped = map_coordinates(
            native, [sy, sx], order=1, mode="constant", cval=np.nan, prefilter=False
        )
        valid = np.isfinite(mapped)
        lo, hi = np.nanpercentile(mapped[valid], [1, 99.5]) if valid.any() else (0, 1)
        level = np.zeros((h, w), float)
        level[valid] = np.arcsinh(
            10 * np.clip((mapped[valid] - lo) / max(hi - lo, 1e-9), 0, 1)
        ) / np.arcsinh(10)
        rgba = np.zeros((h, w, 4), np.uint8)
        rgba[:, :, :3] = (level[:, :, None] * 255).astype(np.uint8)
        rgba[:, :, 3] = valid * 255
        png = io.BytesIO()
        Image.fromarray(np.flipud(rgba)).save(png, format="PNG")
        target_header["BUNIT"] = hdus[0].header.get("BUNIT", "unknown")
        output = io.BytesIO()
        fits.PrimaryHDU(mapped.astype(np.float32), target_header).writeto(output, checksum=True)
        metadata = {
            "survey": "AllWISE",
            "band": f"W{band}",
            "source": source,
            "source_url": source_url,
            "source_sha256": hashlib.sha256(data).hexdigest(),
            "retrieved_at_utc": datetime.now(UTC).isoformat(),
            "spatial": spatial,
            "unit": target_header["BUNIT"],
            "valid_fraction": float(valid.mean()),
            "stretch": {"mode": "independent_asinh_context_only", "limits": [float(lo), float(hi)]},
            "credits": "WISE, NASA/JPL-Caltech/UCLA, NASA/IPAC IRSA",
            "warnings": [
                "AllWISE multi-epoch coadd: date_obs1/date_obs2 describe its full time span",
                "Different instrument, PSF, passband and epoch: no quantitative SPHEREx comparison",
                "Bilinear display resampling without variance propagation; never substituted for a SPHEREx movie frame",
            ],
        }
        return {"metadata": metadata, "png": png.getvalue(), "fits": output.getvalue()}
