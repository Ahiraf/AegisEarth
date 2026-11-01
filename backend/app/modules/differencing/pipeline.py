import numpy as np

from app.modules.artifacts.derived import output_fits
from app.modules.comparisons.eligibility import assess_display_pair
from app.modules.differencing.processing import difference_gate, subtract


def differences(frames, sources, grid, root, artifact):
    order = sorted(range(2), key=lambda i: sources[i]["metadata"]["mid_mjd"])
    i, j = order
    a, b = sources[i]["metadata"], sources[j]["metadata"]
    pair = assess_display_pair(frames[i], frames[j], a, b)
    # Current frames-v1 explicitly has no quantitative calibration certificate.
    gate = difference_gate(pair, a, b)
    if a["mid_mjd"] == b["mid_mjd"]:
        gate = {
            "eligible": False,
            "reasons": [*gate["reasons"], "distinct_observing_epochs_required"],
        }
    report = {
        "outcome": "ineligible",
        "order": "later_minus_earlier",
        "earlier_input": i,
        "later_input": j,
        "eligibility": gate,
        "pair_evidence": pair,
    }
    if gate["eligible"]:
        result = subtract(frames[i], frames[j])
        ids = [s["metadata"]["product_id"] for s in sources]
        path = root / "result_0.fits"
        png = root / "result_0.png"
        output_fits(path, result, grid, ids, "later_minus_earlier")
        from PIL import Image

        limit = max(float(np.nanpercentile(np.abs(result["science"][result["valid"]]), 99)), 1e-9)
        normalized = np.nan_to_num(np.clip(result["science"] / limit, -1, 1))
        rgba = np.zeros((*normalized.shape, 4), dtype=np.uint8)
        rgba[..., 0] = np.where(normalized > 0, 255, 255 * (1 + normalized))
        rgba[..., 2] = np.where(normalized < 0, 255, 255 * (1 - normalized))
        rgba[..., 1] = 255 * (1 - np.abs(normalized))
        rgba[..., 3] = result["valid"] * 255
        Image.fromarray(np.flipud(rgba)).save(png)
        report.update(
            outcome="ready",
            artifact_indices={
                "planes": artifact(path, "difference_planes", ids),
                "preview": artifact(png, "signed_difference_preview", ids),
            },
            signed_preview={
                "positive": "red",
                "negative": "blue",
                "zero": "white",
                "symmetric_limit_mjy_sr": limit,
            },
        )
    return report
