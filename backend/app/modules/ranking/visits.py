"""One-visit selection in chronological order, before native-pixel inference."""

from decimal import Decimal
from urllib.parse import urlencode

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time

from app.modules.cutouts.acquisition import safe_url
from app.modules.targets.catalog import load_targets


def midpoint(product):
    return float((Decimal(product["start_mjd"]) + Decimal(product["end_mjd"])) / 2)


def select_visit(products, index, maximum):
    # One processing choice per exposure/detector, retaining simultaneous detector images.
    exposures = {}
    for product in products:
        key = product["exposure_key"]
        exposures.setdefault(key, product)
    ordered = sorted(exposures.values(), key=lambda p: (midpoint(p), p["id"]))
    visits = []
    for product in ordered:
        if not visits or midpoint(product) - midpoint(visits[-1][-1]) > 0.5:
            visits.append([])
        visits[-1].append(product)
    if index >= len(visits) or len(visits[index]) < 6:
        raise ValueError("visit_requires_six_distinct_exposures")
    visit = visits[index]
    count = min(maximum, len(visit))
    indices = [round(i * (len(visit) - 1) / (count - 1)) for i in range(count)]
    return [visit[i] for i in indices]


def reject_preset_field(region, products):
    center = SkyCoord(region["ra_deg"], region["dec_deg"], unit="deg")
    epochs = [midpoint(products[0]), midpoint(products[-1])]
    for target in load_targets():
        for epoch in epochs:
            position = target.search_position(Time(epoch, format="mjd", scale="utc").isot)
            predicted = SkyCoord(position["ra_deg"], position["dec_deg"], unit="deg")
            if center.separation(predicted) <= 0.18 * u.deg:
                raise ValueError("metadata_ranker_not_for_preset_targets")


def native_url(product, region):
    return (
        safe_url(product["access_url"], product["release"])
        + "?"
        + urlencode(
            {"center": f"{region['ra_deg']:.12f},{region['dec_deg']:.12f}", "size": "15arcmin"}
        )
    )
