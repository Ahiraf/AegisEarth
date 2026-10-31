"""Release-aware native cutout inspection; no registration or detection claims."""

from pathlib import Path

import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales

from app.modules.observations.feasibility import spectral_wcs, valid_pixels


def inspect_product(path: Path, center: dict, target_position: dict) -> dict:
    with fits.open(path, memmap=False) as hdus:
        hdus.verify("exception")
        for name in ("IMAGE", "FLAGS", "VARIANCE", "ZODI", "WCS-WAVE"):
            if name not in hdus:
                raise ValueError("Missing required science extension")
        image, variance = hdus["IMAGE"].data, hdus["VARIANCE"].data
        h = hdus["IMAGE"].header
        if image.ndim != 2 or max(image.shape) > 512 or h.get("TIMESYS") != "UTC":
            raise ValueError("Unsupported research grid/time scale")
        if (
            u.Unit(h["BUNIT"]) != u.MJy / u.sr
            or u.Unit(hdus["VARIANCE"].header["BUNIT"]) != (u.MJy / u.sr) ** 2
        ):
            raise ValueError("Unexpected scientific units")
        wcs = WCS(h)

        def sky(position):
            return SkyCoord(position["ra_deg"], position["dec_deg"], unit="deg")

        cx, cy = wcs.world_to_pixel(sky(center))
        tx, ty = wcs.world_to_pixel(sky(target_position))
        if not (0 <= cx < image.shape[1] and 0 <= cy < image.shape[0]):
            raise ValueError("Fixed sky center outside cutout")
        wave, width = spectral_wcs(h, hdus).pixel_to_world(cx, cy)
        usable, definitions, unknown = valid_pixels(hdus)
        dx, dy = 1 + float(tx) - h["CRPIX1A"], 1 + float(ty) - h["CRPIX2A"]
        if "EPSF" in hdus:
            psf = hdus["EPSF"].data
            selected = int(np.argmin((psf["XCENTER"] - dx) ** 2 + (psf["YCENTER"] - dy) ** 2))
            plane = psf["EPSF"][selected]
            model = {
                "kind": "QR3_EPSF_table",
                "row_0based": selected,
                "shape": list(plane.shape),
                "support_stars": int(psf["NSTAR"][selected]),
                "finite": bool(np.isfinite(plane).all()),
            }
        elif "PSF" in hdus:
            psf = hdus["PSF"]
            zones = [int(key.split("_")[1]) for key in psf.header if key.startswith("XCTR_")]
            selected = min(
                zones,
                key=lambda i: (
                    (psf.header[f"XCTR_{i}"] - dx) ** 2 + (psf.header[f"YCTR_{i}"] - dy) ** 2
                ),
            )
            plane = psf.data[selected - 1]
            model = {
                "kind": "QR2_legacy_PSF_cube",
                "plane_fits_1based": selected,
                "shape": list(plane.shape),
                "finite": bool(np.isfinite(plane).all()),
            }
        else:
            raise ValueError("Missing release-specific PSF/ePSF reference")
        yy, xx = np.indices(image.shape)
        radius = np.hypot(xx - float(tx), yy - float(ty))
        aperture, background = radius <= 1.5, (radius >= 4) & (radius <= 10) & usable
        retained, snr = aperture & usable, None
        if retained.sum() >= 3 and background.sum() >= 10:
            level = float(np.median(image[background]))
            noise = float(
                variance[retained].sum()
                + retained.sum() ** 2
                * np.pi
                / (2 * background.sum())
                * np.median(variance[background])
            )
            snr = float((image[retained] - level).sum() / np.sqrt(noise))
        flags = hdus["FLAGS"].data.astype(np.uint64)
        return {
            "observation_id": h["OBSID"],
            "pipeline_version": str(hdus[0].header["VERSION"]),
            "time_scale": h["TIMESYS"],
            "start_utc": h["DATE-BEG"] + "Z",
            "mid_utc": h["DATE-AVG"] + "Z",
            "end_utc": h["DATE-END"] + "Z",
            "mjd_mid_original": str(h["MJD-AVG"]),
            "reference_catalog": h.get("REFCAT.VERSION"),
            "detector": int(h["DETECTOR"]),
            "shape": list(image.shape),
            "pixel_scale_arcsec": list(map(float, proj_plane_pixel_scales(wcs) * 3600)),
            "header_psf_fwhm_arcsec": h.get("PSF_FWHM"),
            "unit": h["BUNIT"],
            "frame": h.get("RADESYS"),
            "wavelength_um": float(wave.to_value(u.um)),
            "bandwidth_um": float(width.to_value(u.um)),
            "finite_fraction": float(np.isfinite(image).mean()),
            "usable_fraction": float(usable.mean()),
            "flag_definitions": definitions,
            "unknown_flag_pixels": unknown,
            "flagged_pixels": {
                name: int(np.count_nonzero(flags & (1 << bit))) for name, bit in definitions.items()
            },
            "target_pixel_0based": [float(tx), float(ty)],
            "target_aperture_pixels": int(aperture.sum()),
            "usable_target_aperture_pixels": int(retained.sum()),
            "aperture_contrast_snr_proxy": snr,
            "snr_method": "uncorrected_aperture_contrast_not_validated_detection_or_flux",
            "psf_reference": model,
            "hdus": [hdu.name for hdu in hdus],
            "registration_validated": False,
            "target_detection_validated": False,
        }
