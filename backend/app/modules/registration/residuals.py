"""Bounded static-reference validation; requested target exclusion and held-out residuals."""

import numpy as np
from scipy.ndimage import maximum_filter
from scipy.spatial import cKDTree


def reference_sources(frame, exclusion_radius=4):
    image = frame["science"]
    valid = frame["valid"]
    if valid.sum() < 25:
        return np.empty((0, 2))
    background = float(np.nanmedian(image[valid]))
    mad = float(1.4826 * np.nanmedian(np.abs(image[valid] - background)))
    noise = np.sqrt(frame["variance"] + mad**2)
    snr = np.where(valid, (image - background) / noise, -np.inf)
    peaks = (snr == maximum_filter(snr, size=5, mode="constant", cval=-np.inf)) & (snr >= 5)
    yy, xx = np.indices(image.shape)
    peaks &= (xx - (image.shape[1] - 1) / 2) ** 2 + (
        yy - (image.shape[0] - 1) / 2
    ) ** 2 > exclusion_radius**2
    peaks[:2] = False
    peaks[-2:] = False
    peaks[:, :2] = False
    peaks[:, -2:] = False
    coords = np.column_stack(np.where(peaks))
    if len(coords) > 256:
        coords = coords[np.argsort(snr[peaks])[-256:]]
    stars = []
    for y, x in coords:
        patch = image[y - 1 : y + 2, x - 1 : x + 2] - background
        if not valid[y - 1 : y + 2, x - 1 : x + 2].all():
            continue
        weights = np.maximum(patch, 0)
        total = weights.sum()
        if total <= 0:
            continue
        py, px = np.indices((3, 3))
        stars.append(
            [
                x - 1 + float((px * weights).sum() / total),
                y - 1 + float((py * weights).sum() / total),
            ]
        )
    return np.asarray(stars).reshape(-1, 2)


def measure_registration(reference, current, *, exclusion_radius=4):
    a = reference_sources(reference, exclusion_radius)
    b = reference_sources(current, exclusion_radius)
    result = {
        "method": "mutual_static_centroids_heldout_translation_v1",
        "validated": False,
        "reference_count": len(a),
        "current_count": len(b),
        "excluded_target_radius_pixels": exclusion_radius,
        "offset_pixels": [0.0, 0.0],
        "heldout_rms_pixels": None,
        "absolute_astrometry_validated": False,
    }
    if min(len(a), len(b)) < 8:
        return {**result, "reason": "insufficient_static_references"}
    distance, index = cKDTree(b).query(a, distance_upper_bound=2)
    _, reverse = cKDTree(a).query(b)
    pairs = [
        (i, int(j))
        for i, j in enumerate(index)
        if np.isfinite(distance[i]) and j < len(b) and reverse[j] == i
    ]
    pairs.sort(key=lambda p: tuple(a[p[0]]))
    if len(pairs) < 8:
        return {**result, "reason": "insufficient_mutual_matches", "matched_count": len(pairs)}
    delta = np.array([b[j] - a[i] for i, j in pairs])
    fit = delta[::2]
    check = delta[1::2]
    offset = np.median(fit, axis=0)
    residual = check - offset
    good = np.linalg.norm(residual, axis=1) <= 0.7
    # Do not quietly reject large held-out residuals to manufacture good registration.
    rms = float(np.sqrt(np.mean(np.sum(residual**2, axis=1))))
    locations = np.array([a[i] for i, _ in pairs])
    spread = np.ptp(locations, axis=0)
    supported = bool(
        rms <= 0.35
        and good.all()
        and np.linalg.norm(offset) <= 2
        and np.all(spread >= np.array(reference["science"].shape[::-1]) * 0.3)
    )
    return {
        **result,
        "validated": supported,
        "matched_count": len(pairs),
        "fit_count": len(fit),
        "heldout_count": len(check),
        "offset_pixels": list(map(float, offset)),
        "heldout_rms_pixels": rms,
        "reason": None if supported else "registration_residual_or_spatial_support_failed",
    }
