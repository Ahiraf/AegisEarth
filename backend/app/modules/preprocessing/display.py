import numpy as np
from PIL import Image


def stretch_limits(arrays, masks):
    samples = []
    for array, mask in zip(arrays, masks, strict=True):
        data = array[mask & np.isfinite(array)]
        if data.size:
            samples.append(data[:: max(1, int(np.ceil(data.size / 100000)))])
    if not samples:
        return [0.0, 1.0]
    lo, hi = map(float, np.percentile(np.concatenate(samples), [1, 99.5]))
    if hi <= lo:
        hi = lo + max(1e-6, abs(lo) * 1e-6)
    return [lo, hi]


def preview(path, science, valid, limits):
    lo, hi = limits
    normalized = np.clip(np.nan_to_num((science - lo) / (hi - lo), nan=0), 0, 1)
    gray = (np.arcsinh(10 * normalized) / np.arcsinh(10) * 255).astype(np.uint8)
    alpha = (valid & np.isfinite(science)).astype(np.uint8) * 255
    rgba = np.stack([gray, gray, gray, alpha], axis=-1)
    Image.fromarray(np.flipud(rgba)).save(path, format="PNG")


def temporal_bins(frames, selected, seconds):
    if not selected:
        return []
    anchor = min(frames[i]["metadata"]["start_mjd"] for i in selected)
    groups = {}
    for i in selected:
        metadata = frames[i]["metadata"]
        key = int(np.floor((metadata["mid_mjd"] - anchor) * 86400 / seconds)) if seconds else i
        groups.setdefault(key, []).append(i)
    result = []
    for contributors in groups.values():
        start = min(frames[i]["metadata"]["start_mjd"] for i in contributors)
        end = max(frames[i]["metadata"]["end_mjd"] for i in contributors)
        # A long individual exposure must not be disguised as a short temporal bin.
        if seconds and (end - start) * 86400 > seconds + 1e-3:
            result.extend(
                {
                    "contributors": [i],
                    "reason": "exposure_span_exceeds_bin",
                    "start_mjd": frames[i]["metadata"]["start_mjd"],
                    "end_mjd": frames[i]["metadata"]["end_mjd"],
                }
                for i in contributors
            )
        else:
            result.append(
                {"contributors": contributors, "reason": None, "start_mjd": start, "end_mjd": end}
            )
    return sorted(result, key=lambda row: (row["start_mjd"], row["contributors"]))
