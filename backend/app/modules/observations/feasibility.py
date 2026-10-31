"""Offline SPHEREx FITS inspection for milestone-one research, not a discovery API."""

import hashlib
import re
import time
from pathlib import Path

import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS

REQUIRED_HDUS = ("IMAGE", "FLAGS", "VARIANCE", "ZODI", "PSF", "WCS-WAVE")
INFORMATIONAL_FLAGS = frozenset({"MP_SOURCE", "MP_FULLSAMPLE"})


def flag_definitions(header):
    """Normalize QR2 MP_* bit indices and QR3 MSKN/MSKM name/mask cards."""
    definitions = {key: int(header[key]) for key in header if key.startswith("MP_")}
    for key in header:
        if re.fullmatch(r"MSKN\d{4}", key):
            mask = int(header["MSKM" + key[4:]])
            if mask <= 0 or mask & (mask - 1):
                raise ValueError("Quality mask must contain exactly one bit")
            name, bit = "MP_" + str(header[key]), mask.bit_length() - 1
            if name in definitions and definitions[name] != bit:
                raise ValueError("Conflicting quality flag definitions")
            definitions[name] = bit
    return definitions


def spectral_wcs(header, hdus):
    # SIP applies to celestial geometry, not the separate WAVE-TAB lookup.
    spectral_header = header.copy()
    for key in list(spectral_header):
        if re.fullmatch(r"(?:A|B|AP|BP)_(?:ORDER|\d+_\d+)", key):
            del spectral_header[key]
    result = WCS(spectral_header, fobj=hdus, key="W")
    result.sip = None
    return result


def valid_pixels(hdus):
    science, variance = hdus["IMAGE"].data, hdus["VARIANCE"].data
    flags = hdus["FLAGS"].data.astype(np.uint64)
    if science.shape != variance.shape or science.shape != flags.shape:
        raise ValueError("Science, variance and flags must share a grid")
    definitions = flag_definitions(hdus["FLAGS"].header)
    if not definitions or not definitions.keys() >= INFORMATIONAL_FLAGS:
        raise ValueError("Expected flag semantics are missing")
    if any(not 0 <= bit < 32 for bit in definitions.values()):
        raise ValueError("Unsupported flag-bit definition")
    if len(set(definitions.values())) != len(definitions):
        raise ValueError("Ambiguous duplicate flag-bit definitions")
    known_mask = sum(1 << bit for bit in set(definitions.values()))
    reject_mask = sum(
        1 << bit for key, bit in definitions.items() if key not in INFORMATIONAL_FLAGS
    )
    unknown = flags & np.uint64((2**64 - 1) ^ known_mask)
    usable = np.isfinite(science) & np.isfinite(variance) & (variance > 0)
    usable &= (flags & np.uint64(reject_mask)) == 0
    usable &= unknown == 0
    return usable, definitions, int(np.count_nonzero(unknown))


def inspect_cutout(path: Path, ra_deg: float, dec_deg: float) -> dict:
    started = time.perf_counter()
    with fits.open(path, memmap=False, checksum=True) as hdus:
        if any(name not in hdus for name in REQUIRED_HDUS):
            raise ValueError("Missing required SPHEREx extension")
        hdus.verify("exception")
        science = hdus["IMAGE"]
        header = science.header
        if science.data.ndim != 2 or max(science.data.shape) > 512:
            raise ValueError("Research cutout must be 2D and <=512 pixels on each edge")
        if u.Unit(header.get("BUNIT", "")) != u.MJy / u.sr:
            raise ValueError("Unexpected surface-brightness unit")
        if u.Unit(hdus["VARIANCE"].header.get("BUNIT", "")) != (u.MJy / u.sr) ** 2:
            raise ValueError("Unexpected variance unit")
        if header.get("TIMESYS") != "UTC":
            raise ValueError("This research inspector requires explicit UTC FITS times")
        spatial = WCS(header)
        x, y = spatial.world_to_pixel(SkyCoord(ra_deg, dec_deg, unit="deg", frame="icrs"))
        if not (0 <= x < science.data.shape[1] and 0 <= y < science.data.shape[0]):
            raise ValueError("Target falls outside cutout")
        wave, width = spectral_wcs(header, hdus).pixel_to_world(x, y)
        usable, definitions, unknown = valid_pixels(hdus)
        # Documented cutout->detector transform uses FITS 1-based CRPIX keywords.
        original_x = 1 + float(x) - float(header["CRPIX1A"])
        original_y = 1 + float(y) - float(header["CRPIX2A"])
        psf = hdus["PSF"]
        zones = [int(key.split("_")[1]) for key in psf.header if key.startswith("XCTR_")]
        if not zones:
            raise ValueError("PSF zone reference metadata missing")
        selected = min(
            zones,
            key=lambda i: (
                (psf.header[f"XCTR_{i}"] - original_x) ** 2
                + (psf.header[f"YCTR_{i}"] - original_y) ** 2
            ),
        )
        plane = psf.data[selected - 1]
        flags = hdus["FLAGS"].data.astype(np.uint64)
        result = {
            "observation_id": header["OBSID"],
            "detector": int(header["DETECTOR"]),
            "pipeline_version": str(hdus[0].header["VERSION"]),
            "reference_catalog": header.get("REFCAT.VERSION"),
            "time_scale": header["TIMESYS"],
            "mjd_start_original": str(header["MJD-BEG"]),
            "mjd_mid_original": str(header["MJD-AVG"]),
            "start_utc": header["DATE-BEG"] + "Z",
            "mid_utc": header["DATE-AVG"] + "Z",
            "end_utc": header["DATE-END"] + "Z",
            "shape": list(science.data.shape),
            "unit": header["BUNIT"],
            "frame": header.get("RADESYS"),
            "target_pixel_0based": [float(x), float(y)],
            "target_detector_pixel_0based": [original_x, original_y],
            "wavelength_um": float(wave.to_value(u.um)),
            "bandwidth_um": float(width.to_value(u.um)),
            "finite_fraction": float(np.isfinite(science.data).mean()),
            "usable_fraction": float(usable.mean()),
            "unknown_flag_pixels": unknown,
            "flag_definitions": definitions,
            "flagged_pixels": {
                key: int(np.count_nonzero(flags & (1 << bit))) for key, bit in definitions.items()
            },
            "psf_cube_shape": list(psf.data.shape),
            "psf_zone_fits_1based": selected,
            "psf_plane_finite": bool(np.isfinite(plane).all()),
            "psf_plane_sum": float(plane.sum()),
            "psf_plane_sha256": hashlib.sha256(plane.tobytes()).hexdigest(),
            "psf_fwhm_arcsec": float(header["PSF_FWHM"]),
            "fits_checksum_present": [h.name for h in hdus if "CHECKSUM" in h.header],
            "hdus": [
                {"name": h.name, "shape": None if h.data is None else list(h.data.shape)}
                for h in hdus
            ],
        }
    result["inspection_seconds"] = round(time.perf_counter() - started, 6)
    return result


def interval_overlap_fraction(center_a, width_a, center_b, width_b):
    """FWHM-interval proxy, not an integral of measured transmission curves."""
    if any(
        not np.isfinite(value).all()
        for value in map(np.asarray, (center_a, width_a, center_b, width_b))
    ):
        raise ValueError("Wavelengths and bandwidths must be finite")
    if np.any(np.asarray(width_a) <= 0) or np.any(np.asarray(width_b) <= 0):
        raise ValueError("Bandwidths must be positive")
    overlap = np.maximum(
        0,
        np.minimum(center_a + width_a / 2, center_b + width_b / 2)
        - np.maximum(center_a - width_a / 2, center_b - width_b / 2),
    )
    return overlap / np.minimum(width_a, width_b)


def measure_pair_geometry(reference: Path, science: Path) -> dict:
    with fits.open(reference, memmap=False) as a, fits.open(science, memmap=False) as b:
        wa, wb = WCS(a["IMAGE"].header), WCS(b["IMAGE"].header)
        yy, xx = np.indices(a["IMAGE"].data.shape)
        sky = wa.pixel_to_world(xx, yy)
        bx, by = wb.world_to_pixel(sky)
        ny, nx = b["IMAGE"].data.shape
        overlap = (
            np.isfinite(bx)
            & np.isfinite(by)
            & (bx >= 0)
            & (by >= 0)
            & (bx < nx - 1)
            & (by < ny - 1)
        )
        # Requiring all four interpolation neighbors avoids ignoring masked samples at boundaries.
        x0 = np.floor(np.nan_to_num(bx)).astype(int).clip(0, nx - 2)
        y0 = np.floor(np.nan_to_num(by)).astype(int).clip(0, ny - 2)
        good_a, _, _ = valid_pixels(a)
        good_b, _, _ = valid_pixels(b)
        mapped_good = (
            good_b[y0, x0] & good_b[y0 + 1, x0] & good_b[y0, x0 + 1] & good_b[y0 + 1, x0 + 1]
        )
        common = overlap & good_a & mapped_good
        wave_a, width_a = spectral_wcs(a["IMAGE"].header, a).pixel_to_world(xx, yy)
        wave_b, width_b = spectral_wcs(b["IMAGE"].header, b).pixel_to_world(bx, by)
        values = interval_overlap_fraction(
            wave_a.to_value(u.um)[common],
            width_a.to_value(u.um)[common],
            wave_b.to_value(u.um)[common],
            width_b.to_value(u.um)[common],
        )
        return {
            "reference_pixels": int(common.size),
            "geometric_overlap_fraction": float(overlap.mean()),
            "common_usable_pixels": int(common.sum()),
            "common_usable_fraction": float(common.mean()),
            "minimum_local_interval_overlap": float(np.min(values)) if values.size else 0.0,
            "median_local_interval_overlap": float(np.median(values)) if values.size else 0.0,
            "mapping_method": "celestial_WCS_with_conservative_four_neighbor_mask",
            "astrometric_registration_validated": False,
        }
