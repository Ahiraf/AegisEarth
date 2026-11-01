import itertools

import numpy as np

from app.modules.artifacts.derived import output_fits
from app.modules.coadds.processing import combine
from app.modules.comparisons.eligibility import assess_display_pair
from app.modules.preprocessing.display import preview, stretch_limits


def coadds(frames, sources, query, grid, root, artifact):
    selected = [i for i, s in enumerate(sources) if s["metadata"]["detector"] == query["detector"]]
    groups = []
    if query["mode"] == "detector_composite":
        for i in sorted(selected, key=lambda i: sources[i]["metadata"]["start_mjd"]):
            if (
                not groups
                or (
                    sources[i]["metadata"]["end_mjd"]
                    - sources[groups[-1][0]]["metadata"]["start_mjd"]
                )
                * 86400
                > query["epoch_window_seconds"]
            ):
                groups.append([i])
            else:
                groups[-1].append(i)
    elif selected:
        groups = [selected]
    outputs = []
    renderings = []
    for group in groups:
        gates = []
        if (
            len(
                {
                    (
                        sources[i]["metadata"].get("release"),
                        sources[i]["metadata"].get("calibration_version"),
                    )
                    for i in group
                }
            )
            > 1
        ):
            gates.append("different_release_or_processing_family")
        if query["mode"] != "detector_composite":
            for i, j in itertools.combinations(group, 2):
                gate = assess_display_pair(
                    frames[i], frames[j], sources[i]["metadata"], sources[j]["metadata"]
                )
                if not gate["spectral_display_eligible"]:
                    gates.extend(gate["reasons"])
        if gates:
            outputs.append(
                {"indices": group, "status": "ineligible", "reasons": sorted(set(gates))}
            )
            continue
        arrays = []
        for i in group:
            f = {**frames[i], "valid": frames[i]["valid"].copy()}
            f["valid"] &= (f["wavelength"] >= query["wavelength_min_um"]) & (
                f["wavelength"] <= query["wavelength_max_um"]
            )
            arrays.append(f)
        result = combine(
            arrays, mode=query["mode"], minimum_contributors=query["minimum_contributors"]
        )
        result["exposure"] = np.sum(
            [
                f["valid"]
                * max(
                    0,
                    (sources[i]["metadata"]["end_mjd"] - sources[i]["metadata"]["start_mjd"])
                    * 86400,
                )
                for f, i in zip(arrays, group, strict=True)
            ],
            axis=0,
        )
        if not result["valid"].any():
            outputs.append(
                {
                    "indices": group,
                    "status": "no_data",
                    "reasons": ["insufficient_valid_pixels_in_fixed_wavelength_window"],
                }
            )
            continue
        index = len(outputs)
        ids = [sources[i]["metadata"]["product_id"] for i in group]
        path = root / f"result_{index}.fits"
        png = root / f"result_{index}.png"
        output_fits(path, result, grid, ids, query["mode"])
        outputs.append(
            {
                "indices": group,
                "status": "ready",
                "artifact_indices": {
                    "planes": artifact(path, "coadd_planes", ids),
                },
                "start_mjd": min(sources[i]["metadata"]["start_mjd"] for i in group),
                "end_mjd": max(sources[i]["metadata"]["end_mjd"] for i in group),
                "unit": "MJy/sr",
                "usable_fraction": float(result["valid"].mean()),
                "count_range": [int(result["count"].min()), int(result["count"].max())],
                "wavelength_window_um": [query["wavelength_min_um"], query["wavelength_max_um"]],
                "response": "per_pixel_inverse_variance_weighted_WCS_WAVE_proxy_with_min_max_support_maps",
                "weight_definition": "normalized_inverse_variance"
                if query["mode"] != "weighted_sum"
                else "normalized_inverse_variance_times_valid_input_count",
                "quantitative_eligible": False,
                "warnings": [
                    "WCS-only display alignment; independent registration may be unsupported",
                    "Different local wavelengths are broadband display information, not one calibrated monochromatic measurement",
                    "Temporal stacks smear motion and dilute variability; source movie is retained",
                    "PSF matching, covariance and quantitative response validation are not applied",
                ],
            }
        )
        renderings.append((png, result, outputs[-1], ids))
    shared = stretch_limits(
        [item[1]["science"] for item in renderings], [item[1]["valid"] for item in renderings]
    )
    for png, result, group, ids in renderings:
        preview(png, result["science"], result["valid"], shared)
        group["artifact_indices"]["preview"] = artifact(png, "coadd_preview", ids)
        group["stretch"] = {"mode": "shared_asinh", "limits_mjy_sr": shared, "asinh_softening": 10}
    return {
        "groups": outputs,
        "outcome": "ready"
        if any(g["status"] == "ready" for g in outputs)
        else "ineligible"
        if any(g["status"] == "ineligible" for g in outputs)
        else "no_data",
        "detector": query["detector"],
        "available_detectors": sorted({s["metadata"]["detector"] for s in sources}),
    }
