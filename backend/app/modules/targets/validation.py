"""Conservative target-validation diagnostics, never a detection/photometry service.

Use unchanged native arrays and epoch-specific predicted positions. Predictions omit
parallax/perspective/observer effects; small-aperture diagonal errors are proxies.
"""

import itertools

import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales

from app.modules.observations.feasibility import spectral_wcs, valid_pixels

VERSION = "target-validation-v1"


def aperture_diagnostic(science, variance, usable, x, y):
    """Require a full, usable 1.5-pixel aperture. Never turn missing pixels into zero flux."""
    yy, xx = np.indices(science.shape)
    radius = np.hypot(xx - x, yy - y)
    aperture = radius <= 1.5
    background = (radius >= 4) & (radius <= 10) & usable
    edge = (
        x - 1.5 < 0
        or y - 1.5 < 0
        or x + 1.5 > science.shape[1] - 1
        or y + 1.5 > science.shape[0] - 1
    )
    count = int(aperture.sum())
    retained = int((aperture & usable).sum())
    result = {
        "aperture_radius_pixels": 1.5,
        "aperture_pixels": count,
        "usable_pixels": retained,
        "usable_fraction": retained / count if count else 0.0,
        "background_pixels": int(background.sum()),
        "edge_truncated": bool(edge),
        "contrast_sum_mjy_sr_pixels": None,
        "diagonal_error_proxy": None,
        "contrast_snr_proxy": None,
        "centroid_pixel_0based": None,
        "scientific_detection_validated": False,
        "method": "uncorrected_fixed_aperture_median_annulus_diagonal_variance_proxy",
    }
    if edge or count < 3 or retained != count or background.sum() < 10:
        return result | {"reason": "incomplete_masked_aperture_or_background"}
    level = float(np.median(science[background]))
    error2 = float(
        variance[aperture].sum()
        + count**2 * np.pi / (2 * background.sum()) * np.median(variance[background])
    )
    if not np.isfinite(error2) or error2 <= 0:
        return result | {"reason": "invalid_variance"}
    contrast = float((science[aperture] - level).sum())
    snr = contrast / np.sqrt(error2)
    weights = np.where(aperture, np.maximum(science - level, 0), 0)
    weights = np.nan_to_num(weights, nan=0)
    centroid = None
    if snr >= 5 and weights.sum() > 0:
        centroid = [
            float((xx * weights).sum() / weights.sum()),
            float((yy * weights).sum() / weights.sum()),
        ]
    return result | {
        "reason": "diagnostic_only_not_calibrated_significance",
        "background_mjy_sr": level,
        "contrast_sum_mjy_sr_pixels": contrast,
        "diagonal_error_proxy": float(np.sqrt(error2)),
        "contrast_snr_proxy": float(snr),
        "centroid_pixel_0based": centroid,
    }


def inspect_target(path, target, region):
    with fits.open(path, memmap=False) as hdus:
        science = np.asarray(hdus["IMAGE"].data, dtype=float)
        variance = np.asarray(hdus["VARIANCE"].data, dtype=float)
        if science.ndim != 2 or science.shape != variance.shape or max(science.shape) > 512:
            raise ValueError("Unsupported bounded target image")
        header = hdus["IMAGE"].header
        if header["TIMESYS"] != "UTC" or u.Unit(header["BUNIT"]) != u.MJy / u.sr:
            raise ValueError("Unsupported target units/time scale")
        wcs = WCS(header).celestial
        instant = Time(float(header["MJD-AVG"]), format="mjd", scale="utc")
        prediction = target.search_position(instant.isot)
        x, y = map(float, wcs.world_to_pixel_values(prediction["ra_deg"], prediction["dec_deg"]))
        inside = bool(
            np.isfinite([x, y]).all() and 0 <= x < science.shape[1] and 0 <= y < science.shape[0]
        )
        usable, definitions, unknown = valid_pixels(hdus)
        diagnostic = (
            aperture_diagnostic(science, variance, usable, x, y)
            if inside
            else {
                "reason": "predicted_position_outside_frame",
                "contrast_snr_proxy": None,
                "centroid_pixel_0based": None,
                "scientific_detection_validated": False,
            }
        )
        radius = np.hypot(*np.indices(science.shape) - np.array([y, x])[:, None, None])
        aperture = radius <= 1.5
        flags = np.asarray(hdus["FLAGS"].data, dtype=np.uint64)
        counts = {
            name: int(np.count_nonzero(aperture & ((flags & (1 << bit)) != 0)))
            for name, bit in definitions.items()
        }
        wave, width = spectral_wcs(header, hdus).pixel_to_world(x, y) if inside else (None, None)
        scale = float(np.mean(proj_plane_pixel_scales(wcs)) * 3600)
        separation = (
            SkyCoord(prediction["ra_deg"], prediction["dec_deg"], unit="deg")
            .separation(SkyCoord(region["ra_deg"], region["dec_deg"], unit="deg"))
            .arcsec
        )
        centroid = diagnostic["centroid_pixel_0based"]
        candidate = list(map(float, wcs.pixel_to_world_values(*centroid))) if centroid else None
        return {
            "observed_at_utc": instant.isot + "Z",
            "mid_mjd_utc": str(header["MJD-AVG"]),
            "start_mjd_utc": str(header["MJD-BEG"]),
            "end_mjd_utc": str(header["MJD-END"]),
            "prediction": prediction,
            "prediction_inside": inside,
            "prediction_pixel_0based": [x, y] if inside else None,
            "predicted_offset_from_fixed_center_arcsec": float(separation),
            "pixel_scale_arcsec": scale,
            "header_psf_fwhm_arcsec_unvalidated": float(header["PSF_FWHM"])
            if "PSF_FWHM" in header
            else None,
            "sampling_is_not_angular_resolution": True,
            "aperture": diagnostic,
            "aperture_flags": counts,
            "unknown_flag_pixels_in_image": unknown,
            "saturation_or_bright_artifact_flags": {
                k: v
                for k, v in counts.items()
                if any(n in k for n in ("OVERFLOW", "NONLINEAR", "BLOOM", "HALO", "PERSIST"))
            },
            "target_local_wavelength_um": float(wave.to_value(u.um)) if wave is not None else None,
            "target_local_bandwidth_um": float(width.to_value(u.um)) if width is not None else None,
            "candidate_centroid_icrs_deg_unvalidated": candidate,
            "scientific_motion_arcsec": None,
            "scientific_brightness_change": None,
            "limits": [
                "Prediction omits parallax, radial velocity/perspective and observer ephemeris",
                "Aperture contrast/centroid are diagnostics, not verified source association or calibrated detection",
                "No covariance, aperture correction or PSF/response/photometric matching applied",
            ],
        }


def compare_targets(target, diagnostics, frames, pairs, exclusion_radius):
    results = []
    for i, j in itertools.combinations(range(len(diagnostics)), 2):
        a, b = diagnostics[i], diagnostics[j]
        years = abs(
            float(
                (
                    Time(float(b["mid_mjd_utc"]), format="mjd", scale="utc")
                    - Time(float(a["mid_mjd_utc"]), format="mjd", scale="utc")
                ).to_value(u.yr)
            )
        )
        pm = (
            np.hypot(target.pm_ra_cosdec_mas_yr, target.pm_dec_mas_yr)
            if target.pm_ra_cosdec_mas_yr is not None and target.pm_dec_mas_yr is not None
            else None
        )
        expected = float(pm * years / 1000) if pm is not None else None
        scale = (a["pixel_scale_arcsec"] + b["pixel_scale_arcsec"]) / 2
        residuals = [
            f.get("registration", {}).get(
                "post_reprojection_heldout_rms_pixels",
                f.get("registration", {}).get("heldout_rms_pixels"),
            )
            for f in (frames[i], frames[j])
        ]
        residual_arcsec = max(residuals) * scale if all(v is not None for v in residuals) else None
        # Catalog error ellipse scalars omit covariance; never label them a complete uncertainty.
        pmerr = [target.astrometry.get("pm_err_maj"), target.astrometry.get("pm_err_min")]
        error_proxy = (
            float(max(pmerr) * years / 1000) if all(v is not None for v in pmerr) else None
        )
        candidates = [d.get("candidate_centroid_icrs_deg_unvalidated") for d in (a, b)]
        shift = (
            float(
                SkyCoord(*candidates[0], unit="deg")
                .separation(SkyCoord(*candidates[1], unit="deg"))
                .arcsec
            )
            if all(c is not None for c in candidates)
            else None
        )
        gate = pairs.get(f"{i}:{j}", {})
        results.append(
            {
                "indices": [i, j],
                "baseline_days": years * 365.25,
                "expected_tangent_motion_arcsec": expected,
                "expected_motion_native_pixels": expected / scale if expected is not None else None,
                "expected_pm_error_scalar_proxy_arcsec": error_proxy,
                "complete_uncertainty_available": False,
                "header_psf_fwhm_arcsec_unvalidated": [
                    a["header_psf_fwhm_arcsec_unvalidated"],
                    b["header_psf_fwhm_arcsec_unvalidated"],
                ],
                "registration_residual_proxy_arcsec": residual_arcsec,
                "registration_target_exclusion_contains_predictions": all(
                    d["predicted_offset_from_fixed_center_arcsec"] + 1.5 * d["pixel_scale_arcsec"]
                    <= exclusion_radius
                    for d in (a, b)
                ),
                "candidate_centroid_displacement_arcsec_unvalidated": shift,
                "scientific_measured_displacement_arcsec": None,
                "scientific_brightness_change": None,
                "display_pair": gate,
                "scientific_claim_blockers": [
                    "Researcher/reviewer scientific sign-off not supplied",
                    "Full observer-dependent astrometry and calibrated PSF/response/covariance unavailable",
                    *(
                        []
                        if gate.get("spectral_display_eligible")
                        else ["Spectral/coverage display gate unsupported"]
                    ),
                    *(
                        []
                        if residual_arcsec is not None
                        else ["Independent pair registration uncertainty unavailable"]
                    ),
                ],
            }
        )
    return results
