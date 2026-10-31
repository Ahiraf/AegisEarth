"""Pre-download footprint support is a geometry estimate, never usable-pixel evidence."""

import numpy as np

from app.modules.registration.grid import make_grid


def footprint_support(product, region):
    grid, shape = make_grid(region)
    coordinates = np.array(product["footprint_icrs"].split()[2:], dtype=float).reshape(-1, 2)
    if len(coordinates) == 5:
        coordinates = coordinates[:-1]
    x, y = grid.world_to_pixel_values(coordinates[:, 0], coordinates[:, 1])
    polygon = np.column_stack((x, y))
    xx, yy = np.meshgrid(
        [-0.5, (shape[1] - 1) / 2, shape[1] - 0.5], [-0.5, (shape[0] - 1) / 2, shape[0] - 0.5]
    )
    points = np.column_stack((xx.ravel(), yy.ravel()))
    crosses = []
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0), strict=True):
        edge = b - a
        delta = points - a
        crosses.append(edge[0] * delta[:, 1] - edge[1] * delta[:, 0])
    cross = np.asarray(crosses)
    inside = np.all(cross >= -1e-7, axis=0) | np.all(cross <= 1e-7, axis=0)
    return float(inside.mean())


def preselect(products, region):
    groups = {}
    for product in products:
        key = (product["release"], product["calibration_version"], product["detector"])
        groups.setdefault(key, []).append((product, footprint_support(product, region)))

    def score(key):
        group = groups[key]
        return (
            sum(s >= 1 for _, s in group),
            sum(s for _, s in group),
            len(group),
            key[0] == "qr3",
            key,
        )

    choice = max(groups, key=score)
    entries = groups[choice]
    full = [p for p, support in entries if support >= 1]
    selected = full or [p for p, _ in entries]
    return selected, {
        "release": choice[0],
        "processing_family": choice[1],
        "detector": choice[2],
        "reason": "prefer_full_requested_footprint_then_largest_consistent_sample; local_response_and_flags_require_FITS",
        "full_footprint_candidates": len(full),
        "family_sample_count": len(entries),
        "coverage_method": "nine_TAN_points_in_SIA_polygon_geometry_only",
    }
