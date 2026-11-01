"""Native-grid point-source aperture extraction. Physical units do not imply science approval."""

import astropy.units as u
import numpy as np
from astropy.time import Time
from astropy.wcs import WCS
from scipy.ndimage import label

from app.modules.observations.feasibility import spectral_wcs, valid_pixels


def solid_angles(wcs, shape):
    """Spherical quadrilateral area, split into stable atan2 spherical triangles (steradians)."""
    yy, xx = np.indices(shape)
    vectors = []
    for dx, dy in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
        ra, dec = np.deg2rad(wcs.pixel_to_world_values(xx + dx, yy + dy))
        vectors.append(
            np.stack((np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)), axis=-1)
        )

    def triangle(a, b, c):
        numerator = np.abs(np.sum(a * np.cross(b, c), axis=-1))
        denominator = 1 + np.sum(a * b, axis=-1) + np.sum(b * c, axis=-1) + np.sum(c * a, axis=-1)
        return 2 * np.arctan2(numerator, denominator)

    return triangle(vectors[0], vectors[1], vectors[2]) + triangle(
        vectors[0], vectors[2], vectors[3]
    )


def psf_plane(hdus, x, y):
    h = hdus["IMAGE"].header
    dx, dy = 1 + x - h["CRPIX1A"], 1 + y - h["CRPIX2A"]
    if "EPSF" in hdus:
        data = hdus["EPSF"].data
        row = int(np.argmin((data["XCENTER"] - dx) ** 2 + (data["YCENTER"] - dy) ** 2))
        return (
            np.asarray(data["EPSF"][row], dtype=float),
            5,
            {
                "kind": "QR3_ePSF",
                "row": row,
                "oversampling": 5,
                "support_stars": int(data["NSTAR"][row]),
            },
        )
    p = hdus["PSF"]
    factor = int(p.header["OVERSAMP"])
    # Known historical header failure must not silently apply a wrong correction.
    if factor != 10 or not np.isclose(abs(p.header["CDELT1"]), 0.615, rtol=0.02):
        raise ValueError("Legacy PSF header not corrected")
    zones = [int(k.split("_")[1]) for k in p.header if k.startswith("XCTR_")]
    zone = min(
        zones, key=lambda i: (p.header[f"XCTR_{i}"] - dx) ** 2 + (p.header[f"YCTR_{i}"] - dy) ** 2
    )
    return (
        np.asarray(p.data[zone - 1], dtype=float),
        factor,
        {
            "kind": "QR2_legacy_PSF",
            "zone": zone,
            "oversampling": factor,
            "warning": "QR3 ePSF is recommended by IRSA even for QR2",
        },
    )


def projected_psf(plane, factor, x, y, shape):
    if (
        plane.ndim != 2
        or max(plane.shape) > 256
        or factor not in (5, 10)
        or not np.isfinite(plane).all()
        or plane.sum() <= 0
    ):
        raise ValueError("Unsupported PSF")
    negative = float(-plane[plane < 0].sum() / plane.sum())
    if negative > 0.01:
        raise ValueError("PSF has excessive negative support")
    normalized = np.maximum(plane, 0)
    normalized /= normalized.sum()
    yy, xx = np.indices(plane.shape)
    ix = np.floor(x + (xx - (plane.shape[1] - 1) / 2) / factor + 0.5).astype(int)
    iy = np.floor(y + (yy - (plane.shape[0] - 1) / 2) / factor + 0.5).astype(int)
    inside = (ix >= 0) & (iy >= 0) & (ix < shape[1]) & (iy < shape[0])
    model = np.zeros(shape)
    np.add.at(model, (iy[inside], ix[inside]), normalized[inside])
    return model, negative


def aperture_flux(
    science, variance, valid, background_valid, wcs, x, y, plane, factor, radius, inner, outer
):
    yy, xx = np.indices(science.shape)
    distance = np.hypot(xx - x, yy - y)
    aperture = distance <= radius
    annulus = (distance >= inner) & (distance <= outer) & background_valid
    info = {
        "flux_uJy": None,
        "flux_error_uJy": None,
        "upper_limit_uJy": None,
        "aperture_fraction": None,
        "aperture_pixels": int(aperture.sum()),
        "background_pixels": int(annulus.sum()),
    }
    if not (outer <= x < science.shape[1] - outer and outer <= y < science.shape[0] - outer):
        return info | {"status": "unavailable", "reason": "background_annulus_outside_cutout"}
    if aperture.sum() < 3 or not valid[aperture].all() or annulus.sum() < 20:
        return info | {
            "status": "unavailable",
            "reason": "masked_aperture_or_insufficient_clean_background",
        }
    model, negative = projected_psf(plane, factor, x, y, science.shape)
    fraction = float(model[aperture].sum())
    if not 0.1 < fraction <= 1.000001:
        return info | {"status": "unavailable", "reason": "invalid_PSF_aperture_support"}
    omega = solid_angles(wcs, science.shape)
    if not np.isfinite(omega[aperture]).all() or np.any(omega[aperture] <= 0):
        raise ValueError("Invalid pixel solid angle")
    level = float(np.median(science[annulus]))
    scatter = float(1.4826 * np.median(np.abs(science[annulus] - level)))
    background_variance = float(
        np.pi / (2 * annulus.sum()) * max(float(np.median(variance[annulus])), scatter**2)
    )
    scale = omega[aperture] * 1e12 / fraction  # MJy/sr -> microJy, with model aperture correction
    flux = float(np.sum((science[aperture] - level) * scale))
    error = float(
        np.sqrt(np.sum(variance[aperture] * scale**2) + background_variance * scale.sum() ** 2)
    )
    return info | {
        "status": "diagnostic_only",
        "reason": "absolute_photometry_response_covariance_and_source_model_not_independently_validated",
        "flux_uJy": flux,
        "flux_error_uJy": error,
        "aperture_fraction": fraction,
        "background_mjy_sr": level,
        "background_variance_proxy": background_variance,
        "pixel_solid_angle_range_sr": [float(omega[aperture].min()), float(omega[aperture].max())],
        "negative_PSF_support_clipped_fraction": negative,
        "snr_proxy": flux / error if error > 0 else None,
    }


def extract(hdus, position, options):
    image = hdus["IMAGE"]
    h = image.header
    if (
        u.Unit(h["BUNIT"]) != u.MJy / u.sr
        or u.Unit(hdus["VARIANCE"].header["BUNIT"]) != (u.MJy / u.sr) ** 2
        or h["TIMESYS"] != "UTC"
    ):
        raise ValueError("Unsupported units/time")
    science = np.asarray(image.data, dtype=float)
    variance = np.asarray(hdus["VARIANCE"].data, dtype=float)
    if science.ndim != 2 or max(science.shape) > 512:
        raise ValueError("Image bound exceeded")
    wcs = WCS(h).celestial
    x, y = map(float, wcs.world_to_pixel_values(position["ra_deg"], position["dec_deg"]))
    valid, definitions, unknown = valid_pixels(hdus)
    flags = hdus["FLAGS"].data.astype(np.uint64)
    background = valid & ((flags & (1 << definitions["MP_SOURCE"])) == 0)
    base = {
        "time_scale": "UTC",
        "observed_at_utc": Time(float(h["MJD-AVG"]), format="mjd", scale="utc", precision=6).isot
        + "Z",
        "position": position,
        "start_mjd_utc": str(h["MJD-BEG"]),
        "mid_mjd_utc": str(h["MJD-AVG"]),
        "end_mjd_utc": str(h["MJD-END"]),
        "detector": "D" + str(h["DETECTOR"]),
        "unit": "uJy",
        "wavelength_um": None,
        "bandwidth_um": None,
        "wavelength_method": "WCS-WAVE_visualization_proxy",
        "quantitative_eligible": False,
        "unknown_flag_pixels": unknown,
        "method": "native_point_source_PSF_corrected_aperture_v1",
        "errors": "diagonal_variance_and_robust_median_background_proxy",
        "warnings": [
            "Science CWAVE/CBAND and absolute photometric acceptance are not applied",
            "Point-source assumption; extended/blended sources need a joint fit",
            "No resampling; covariance and PSF-model uncertainty are not included",
            "No formal upper limit or detection is inferred from these diagnostic samples",
        ],
    }
    if not np.isfinite([x, y]).all() or not (
        0 <= x < science.shape[1] and 0 <= y < science.shape[0]
    ):
        return base | {
            "status": "unavailable",
            "reason": "position_outside_input",
            "flux_uJy": None,
            "flux_error_uJy": None,
            "upper_limit_uJy": None,
        }
    wave, width = spectral_wcs(h, hdus).pixel_to_world(x, y)
    base.update(wavelength_um=float(wave.to_value(u.um)), bandwidth_um=float(width.to_value(u.um)))
    radius = np.hypot(*np.indices(science.shape) - np.array([y, x])[:, None, None])
    source_components = label(
        ((flags & (1 << definitions["MP_SOURCE"])) != 0)
        & (radius <= options["aperture_radius_pixels"] + 2)
    )[1]
    base["potential_blend"] = source_components > 1
    base["pixel_flags"] = {
        name: int(
            np.count_nonzero(
                (radius <= options["aperture_radius_pixels"]) & ((flags & (1 << bit)) != 0)
            )
        )
        for name, bit in definitions.items()
    }
    try:
        plane, factor, psf = psf_plane(hdus, x, y)
        base["psf"] = psf
        result = aperture_flux(
            science,
            variance,
            valid,
            background,
            wcs,
            x,
            y,
            plane,
            factor,
            options["aperture_radius_pixels"],
            options["background_inner_pixels"],
            options["background_outer_pixels"],
        )
    except (KeyError, ValueError):
        result = {
            "status": "unavailable",
            "reason": "PSF_reference_unavailable_or_unsupported",
            "flux_uJy": None,
            "flux_error_uJy": None,
            "upper_limit_uJy": None,
        }
    return base | result
