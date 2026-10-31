"""Release-aware, bounded native frames. WCS-WAVE is a visualization wavelength proxy."""

import hashlib
from dataclasses import dataclass

import astropy.units as u
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from app.modules.observations.feasibility import spectral_wcs, valid_pixels


@dataclass
class NativeFrame:
    science: np.ndarray
    variance: np.ndarray
    valid: np.ndarray
    wavelength: np.ndarray
    bandwidth: np.ndarray
    wcs: WCS
    metadata: dict


def psf_metadata(hdus, x, y, release):
    header = hdus["IMAGE"].header
    if "CRPIX1A" not in header or "CRPIX2A" not in header:
        return {"available": False, "reason": "original_detector_transform_missing"}
    dx, dy = 1 + x - header["CRPIX1A"], 1 + y - header["CRPIX2A"]
    if release == "qr3" and "EPSF" in hdus:
        hdu = hdus["EPSF"]
        data = hdu.data
        if not {"XCENTER", "YCENTER", "EPSF", "NSTAR"} <= set(data.names):
            raise ValueError("Unknown QR3 ePSF columns")
        index = int(np.argmin((data["XCENTER"] - dx) ** 2 + (data["YCENTER"] - dy) ** 2))
        plane = np.asarray(data["EPSF"][index], dtype=float)
        selection = {
            "format": "qr3_epsf_table",
            "row_0based": index,
            "support_stars": int(data["NSTAR"][index]),
        }
    elif release == "qr2" and "PSF" in hdus:
        hdu = hdus["PSF"]
        zones = [int(k.split("_")[1]) for k in hdu.header if k.startswith("XCTR_")]
        if not zones:
            raise ValueError("Missing QR2 PSF zones")
        zone = min(
            zones,
            key=lambda i: (hdu.header[f"XCTR_{i}"] - dx) ** 2 + (hdu.header[f"YCTR_{i}"] - dy) ** 2,
        )
        plane = np.asarray(hdu.data[zone - 1], dtype=float)
        selection = {"format": "qr2_psf_cube", "zone_1based": zone}
    else:
        raise ValueError("PSF format does not match release")
    if plane.ndim != 2 or max(plane.shape) > 256:
        raise ValueError("PSF dimensions exceed bounds")
    return {
        **selection,
        "available": bool(np.isfinite(plane).all() and plane.sum() > 0),
        "shape": list(plane.shape),
        "sum": float(np.nansum(plane)),
        "representative_detector_pixel_0based": [float(dx), float(dy)],
        "plane_sha256": hashlib.sha256(plane.tobytes()).hexdigest(),
        "header": str(hdu.header),
        "applied_psf_matching": False,
    }


def read_native(path, product, region):
    with fits.open(path, memmap=False) as hdus:
        image = hdus["IMAGE"]
        h = image.header
        science = np.array(image.data, dtype=float)
        variance = np.array(hdus["VARIANCE"].data, dtype=float)
        if science.ndim != 2 or max(science.shape) > 512:
            raise ValueError("Frame dimensions exceed bounds")
        if h.get("TIMESYS") != "UTC" or h.get("RADESYS", "ICRS").upper() != "ICRS":
            raise ValueError("Unsupported time scale or celestial frame")
        if (
            u.Unit(h["BUNIT"]) != u.MJy / u.sr
            or u.Unit(hdus["VARIANCE"].header["BUNIT"]) != (u.MJy / u.sr) ** 2
        ):
            raise ValueError("Unexpected science or variance units")
        valid, definitions, unknown = valid_pixels(hdus)
        yy, xx = np.indices(science.shape)
        wave, width = spectral_wcs(h, hdus).pixel_to_world(xx, yy)
        wave = np.asarray(wave.to_value(u.um))
        width = np.asarray(width.to_value(u.um))
        valid &= np.isfinite(wave) & np.isfinite(width) & (width > 0)
        spatial = WCS(h).celestial
        if spatial.wcs.radesys.upper() != "ICRS":
            raise ValueError("Native WCS must be ICRS")
        cx, cy = spatial.world_to_pixel_values(region["ra_deg"], region["dec_deg"])
        inside = bool(
            np.isfinite([cx, cy]).all()
            and 0 <= cx < science.shape[1]
            and 0 <= cy < science.shape[0]
        )
        px = (
            float(np.clip(cx, 0, science.shape[1] - 1))
            if np.isfinite(cx)
            else (science.shape[1] - 1) / 2
        )
        py = (
            float(np.clip(cy, 0, science.shape[0] - 1))
            if np.isfinite(cy)
            else (science.shape[0] - 1) / 2
        )
        interval = (float(np.nanmin(wave)), float(np.nanmax(wave)))
        metadata = {
            "product_id": product["id"],
            "collection": product["collection"],
            "release": product["release"],
            "detector": product["detector"],
            "start_mjd": float(h["MJD-BEG"]),
            "end_mjd": float(h["MJD-END"]),
            "mid_mjd": float(h["MJD-AVG"]),
            "time_scale": "UTC",
            "pipeline_version": str(hdus[0].header.get("VERSION", "unknown")),
            "calibration_version": product["calibration_version"],
            "unit": "MJy/sr",
            "variance_unit": "(MJy/sr)^2",
            "native_shape": list(science.shape),
            "native_wcs": spatial.to_header(relax=True).tostring(sep="\n"),
            "original_image_header": str(h),
            "psf": psf_metadata(hdus, px, py, product["release"]),
            "quality": {
                "policy": "strict-flags-v1",
                "informational_flags": ["MP_SOURCE", "MP_FULLSAMPLE"],
                "flag_definitions": definitions,
                "unknown_flag_pixels": unknown,
                "usable_fraction": float(valid.mean()),
            },
            "spectral": {
                "method": "WCS-WAVE_visualization_proxy",
                "quantitative_calibration": False,
                "center_inside": inside,
                "center_sampling": "nearest_native_pixel_visualization_proxy",
                "wavelength_range_um": list(interval),
                "center_wavelength_um": float(wave[round(py), round(px)]) if inside else None,
                "center_bandwidth_um": float(width[round(py), round(px)]) if inside else None,
                "warning": "Quantitative spectra require pipeline CWAVE/CBAND and response/calibration validation",
            },
        }
        from app.modules.bands.catalog import catalog

        metadata["spectral"]["center_usable"] = (
            bool(valid[round(py), round(px)]) if inside else False
        )
        metadata["spectral"]["usable_wavelength_range_um"] = (
            [float(wave[valid].min()), float(wave[valid].max())] if valid.any() else None
        )
        metadata["spectral"]["nominal_window_candidates"] = [
            row["id"]
            for row in catalog()["channels"]
            if row["detector"] == product["detector"]
            and np.any(valid & (np.abs(wave - row["band_center_um"]) <= row["band_width_um"] / 2))
        ]
        metadata["spectral"]["response_availability"] = (
            "representative_nominal_fiducials_available; per-pixel_response_not_applied"
        )
        return NativeFrame(science, variance, valid, wave, width, spatial, metadata)
