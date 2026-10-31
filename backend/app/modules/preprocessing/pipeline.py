"""Bounded frame preparation; native inspection survives failed comparison gates."""

import hashlib
import itertools
import json

import numpy as np
from astropy.io import fits

from app.modules.bands.catalog import catalog, channel
from app.modules.comparisons.eligibility import assess_display_pair, common_group
from app.modules.preprocessing.display import preview, stretch_limits, temporal_bins
from app.modules.preprocessing.readers import read_native
from app.modules.preprocessing.schemas import PreparationOptions
from app.modules.registration.grid import make_grid, reproject
from app.modules.registration.residuals import measure_registration

VERSION = "frames-v1"


def json_safe(value):
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [json_safe(v) for v in value]
    if isinstance(value, np.generic):
        return json_safe(value.item())
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def short_metadata(metadata):
    result = {k: v for k, v in metadata.items() if k != "original_image_header"}
    result["original_image_header_sha256"] = hashlib.sha256(
        metadata["original_image_header"].encode()
    ).hexdigest()
    result["psf"] = {k: v for k, v in metadata["psf"].items() if k != "header"}
    result["original_metadata_location"] = "unchanged_raw_FITS_input"
    return result


def write_planes(path, frame, wcs):
    header = wcs.to_header(relax=True)
    header["BUNIT"] = "MJy/sr"
    hdus = [
        fits.PrimaryHDU(),
        fits.ImageHDU(frame["science"].astype(np.float32), header=header, name="SCIENCE"),
    ]
    for key, name, unit in (
        ("variance", "VARIANCE", "(MJy/sr)^2"),
        ("wavelength", "WAVELENGTH", "um"),
        ("bandwidth", "BANDWIDTH", "um"),
        ("valid", "VALID", ""),
    ):
        h = header.copy()
        h["BUNIT"] = unit
        hdus.append(
            fits.ImageHDU(
                frame[key].astype(np.uint8 if key == "valid" else np.float32), header=h, name=name
            )
        )
    fits.HDUList(hdus).writeto(path, checksum=True)


def spectral_mask(frame, options):
    if options.spectral_mode == "detector":
        return frame["metadata"]["detector"] == options.detector
    if options.spectral_mode == "channel":
        item = channel(options.channel_id)
        if frame["metadata"]["detector"] != item["detector"]:
            return False
        # Explicit nominal fiducial window; this is not a geometric channel-map assignment.
        center, width = item["band_center_um"], item["band_width_um"]
        frame["valid"] &= np.abs(frame["wavelength"] - center) <= width / 2
        return bool(frame["valid"].any())
    return True


def prepare(paths, products, region, raw_artifact_ids, options, root):
    options = PreparationOptions.model_validate(options)
    if len(paths) > 12 or len(paths) != len(products):
        raise ValueError("Frame count exceeds bounds")
    grid, shape = make_grid(region)
    natives = [
        read_native(path, product, region) for path, product in zip(paths, products, strict=True)
    ]
    frames = [{**reproject(native, grid, shape), "metadata": native.metadata} for native in natives]
    allowed = [spectral_mask(frame, options) for frame in frames]
    pairs = {
        f"{i}:{j}": assess_display_pair(
            frames[i], frames[j], natives[i].metadata, natives[j].metadata
        )
        for i, j in itertools.combinations(range(len(frames)), 2)
    }
    candidates = [i for i in range(len(frames)) if allowed[i] and frames[i]["valid"].any()]
    # Use the complete-link chooser with stable original indices.
    eligible_frames = [frames[i] for i in candidates]
    eligible_pairs = {
        f"{i}:{j}": pairs[f"{candidates[i]}:{candidates[j]}"]
        for i, j in itertools.combinations(range(len(candidates)), 2)
    }
    selected = [candidates[i] for i in common_group(eligible_frames, eligible_pairs)]
    registration = {}
    target_radius = (
        np.rad2deg(np.tan(np.deg2rad(options.target_exclusion_radius_arcsec / 3600))) * 3600
    )
    exclusion_pixels = target_radius / min(abs(grid.wcs.cdelt) * 3600)
    for i in range(len(frames)):
        if i not in selected:
            registration[i] = {
                "validated": False,
                "reason": "outside_selected_spectral_group",
                "offset_pixels": [0, 0],
            }
        elif i == selected[0]:
            registration[i] = {
                "validated": False,
                "reason": "reference_grid_has_no_independent_absolute_solution",
                "offset_pixels": [0, 0],
            }
        else:
            measurement = measure_registration(
                frames[selected[0]],
                frames[i],
                exclusion_radius=exclusion_pixels,
            )
            registration[i] = measurement
            if measurement["validated"]:
                corrected = {
                    **reproject(natives[i], grid, shape, measurement["offset_pixels"]),
                    "metadata": natives[i].metadata,
                }
                spectral_mask(corrected, options)
                post = measure_registration(
                    frames[selected[0]],
                    corrected,
                    exclusion_radius=exclusion_pixels,
                )
                measurement["post_reprojection_offset_pixels"] = post["offset_pixels"]
                measurement["post_reprojection_heldout_rms_pixels"] = post.get("heldout_rms_pixels")
                measurement["validated"] = bool(
                    post["validated"] and np.linalg.norm(post["offset_pixels"]) <= 0.35
                )
                if measurement["validated"]:
                    frames[i] = corrected
                else:
                    measurement["reason"] = "post_reprojection_reference_check_failed"
    # Re-check spectral/coverage support after the measured static-field translation.
    pairs = {
        f"{i}:{j}": assess_display_pair(
            frames[i], frames[j], natives[i].metadata, natives[j].metadata
        )
        for i, j in itertools.combinations(range(len(frames)), 2)
    }
    group_supported = len(selected) > 1 and all(
        pairs[f"{i}:{j}"]["spectral_display_eligible"]
        for i, j in itertools.combinations(selected, 2)
    )
    registration_supported = group_supported and all(
        registration[i]["validated"] for i in selected[1:]
    )
    shared = stretch_limits([f["science"] for f in frames], [f["valid"] for f in frames])
    files = []
    entries = []

    def artifact(path, kind, ids):
        with path.open("rb") as stream:
            sha = hashlib.file_digest(stream, "sha256").hexdigest()
        receipt = {
            "path": path.name,
            "sha256": sha,
            "size_bytes": path.stat().st_size,
            "kind": kind,
            "source_product_ids": ids,
            "content_type": "image/png"
            if path.suffix == ".png"
            else "application/fits"
            if path.suffix == ".fits"
            else "application/json",
        }
        files.append(receipt)
        return len(files) - 1

    for i, (native, frame) in enumerate(zip(natives, frames, strict=True)):
        limits = (
            shared
            if options.stretch == "shared_asinh"
            else stretch_limits([frame["science"]], [frame["valid"]])
        )
        native_path = root / f"native_{i}.png"
        common_path = root / f"common_{i}.png"
        planes_path = root / f"planes_{i}.fits"
        # Flagged finite native values are inspectable, with quality metadata and separate masked planes.
        native_mask = (
            native.valid
            if options.native_preview_policy == "masked"
            else np.isfinite(native.science)
        )
        preview(native_path, native.science, native_mask, limits)
        preview(common_path, frame["science"], frame["valid"], limits)
        write_planes(planes_path, frame, grid)
        indices = {
            "native_preview": artifact(native_path, "native_preview", [products[i]["id"]]),
            "common_preview": artifact(common_path, "common_preview", [products[i]["id"]]),
            "planes": artifact(planes_path, "common_grid_planes", [products[i]["id"]]),
        }
        region_wave = frame["wavelength"][frame["valid"]]
        spectral = {
            **native.metadata["spectral"],
            "native_range_scope": "padded_native_cutout",
            "requested_region_usable_wavelength_range_um": [
                float(region_wave.min()),
                float(region_wave.max()),
            ]
            if region_wave.size
            else None,
            "requested_region_nominal_window_candidates": [
                row["id"]
                for row in catalog()["channels"]
                if row["detector"] == native.metadata["detector"]
                and np.any(
                    frame["valid"]
                    & (
                        np.abs(frame["wavelength"] - row["band_center_um"])
                        <= row["band_width_um"] / 2
                    )
                )
            ],
        }
        entries.append(
            {
                "index": i,
                **short_metadata(native.metadata),
                "spectral": spectral,
                "raw_artifact_id": raw_artifact_ids[i],
                "selected_for_default_group": i in selected,
                "registration": registration[i],
                "common_grid_usable_fraction": float(frame["valid"].mean()),
                "stretch": {
                    "mode": options.stretch,
                    "limits_mjy_sr": limits,
                    "asinh_softening": 10,
                },
                "display_eligibility": {
                    "native_preview_policy": options.native_preview_policy,
                    "native_inspection": True,
                    "masked_common_grid": bool(frame["valid"].any()),
                    "comparable_sequence": bool(i in selected and registration_supported),
                },
                "artifact_indices": indices,
            }
        )
    bins = temporal_bins(frames, selected, options.temporal_bin_seconds)
    for index, bin_ in enumerate(bins):
        contributors = bin_["contributors"]
        bin_["count"] = len(contributors)
        bin_["contributor_times"] = [
            {
                "index": i,
                "start_mjd": natives[i].metadata["start_mjd"],
                "end_mjd": natives[i].metadata["end_mjd"],
                "mid_mjd": natives[i].metadata["mid_mjd"],
            }
            for i in contributors
        ]
        if len(contributors) > 1 and registration_supported:
            weight = [
                np.where(
                    frames[i]["valid"],
                    1 / np.where(frames[i]["valid"], frames[i]["variance"], 1),
                    0,
                )
                for i in contributors
            ]
            sumweight = np.sum(weight, axis=0)
            good = sumweight > 0
            combined = {"valid": good}
            for key in ("science", "wavelength", "bandwidth"):
                numerator = np.sum(
                    [
                        w * np.nan_to_num(frames[i][key], nan=0)
                        for w, i in zip(weight, contributors, strict=True)
                    ],
                    axis=0,
                )
                combined[key] = np.divide(
                    numerator, sumweight, out=np.full(shape, np.nan), where=good
                )
            combined["variance"] = np.divide(1, sumweight, out=np.full(shape, np.nan), where=good)
            path = root / f"bin_{index}.fits"
            png = root / f"bin_{index}.png"
            write_planes(path, combined, grid)
            preview(png, combined["science"], good, shared)
            ids = [products[i]["id"] for i in contributors]
            bin_["artifact_indices"] = {
                "planes": artifact(path, "temporal_bin_planes", ids),
                "preview": artifact(png, "temporal_bin_preview", ids),
            }
            bin_["method"] = "explicit_display_inverse_variance_mean_not_validated_photometry"
            bin_["stretch"] = {
                "mode": "shared_asinh",
                "limits_mjy_sr": list(shared),
                "asinh_softening": 10,
            }
        elif len(contributors) > 1:
            bin_["reason"] = "registration_support_insufficient_no_combination"
    report = {
        "version": VERSION,
        "grid": {
            "header": grid.to_header().tostring(sep="\n"),
            "shape": list(shape),
            "requested_region": region,
            "mode": "sky_fixed",
            "pixel_origin": "FITS_lower_left",
            "png_flip_y": True,
            "variance": "squared_bilinear_weights_marginal_only",
        },
        "options": options.model_dump(),
        "frames": entries,
        "pair_eligibility": pairs,
        "selected_indices": selected,
        "sequence_eligible": bool(
            registration_supported
            and len(bins) >= 2
            and len({frames[i]["metadata"]["mid_mjd"] for i in selected}) >= 2
        ),
        "temporal_bins": bins,
        "spectral_calibration_version": catalog()["version"],
        "warnings": [
            "WCS-WAVE provides visualization wavelengths; quantitative pipeline maps are not applied",
            "Nominal channel selection is a fiducial wavelength window, not a geometric channel-map assignment",
            "Relative static-field registration is not absolute astrometry; central target is excluded",
            "Pixel covariance, PSF matching and photometric calibration remain unvalidated; subtraction and photometry blocked",
            "Native flagged previews are inspectable; quantitative eligibility is independent of display eligibility",
            "Explicit temporal averaging can blur change within the recorded contributor span; native inputs remain available",
        ],
        "outcome": "no_inputs"
        if not frames
        else "no_supported_group"
        if not selected
        else "single_epoch"
        if len(bins) < 2
        else "prepared_candidates",
        "viewer_execution_available": False,
    }
    report = json_safe(report)
    path = root / "preparation_report.json"
    path.write_text(json.dumps(report, allow_nan=False), encoding="utf-8")
    artifact(path, "preparation_report", [p["id"] for p in products])
    return report, files
