import csv
import itertools

from astropy.io import fits

from app.modules.observations.feasibility import interval_overlap_fraction
from app.modules.spectra.photometry import extract


def spectra(raws, sources, query, root, artifact):
    samples = []
    for i, path in enumerate(raws):
        ref = sources[i]["ref"]
        position = query.get("position") or next(
            p
            for p in query["epoch_positions"]
            if p["view_id"] == ref["view_id"] and p["index"] == ref["index"]
        )
        with fits.open(path, memmap=False) as h:
            sample = extract(h, position, query)
        sample.update(
            input=ref,
            product_id=sources[i]["metadata"]["product_id"],
            source_sha256=sources[i]["raw"]["sha256"],
            epoch_group=str(sample["mid_mjd_utc"]),
        )
        samples.append(sample)
    samples.sort(key=lambda s: (float(s["mid_mjd_utc"]), s["product_id"]))
    comparisons = []
    for a, b in itertools.combinations(samples, 2):
        if a["flux_uJy"] is None or b["flux_uJy"] is None:
            continue
        overlap = float(
            interval_overlap_fraction(
                a["wavelength_um"], a["bandwidth_um"], b["wavelength_um"], b["bandwidth_um"]
            )
        )
        comparisons.append(
            {
                "products": [a["product_id"], b["product_id"]],
                "interval_overlap_proxy": overlap,
                "quantitative_eligible": False,
                "brightness_change_uJy": None,
                "reason": "PSF_response_calibration_covariance_and_source_model_acceptance_missing",
            }
        )
    path = root / "spectrum.csv"
    fields = [
        "product_id",
        "mid_mjd_utc",
        "detector",
        "wavelength_um",
        "bandwidth_um",
        "flux_uJy",
        "flux_error_uJy",
        "upper_limit_uJy",
        "status",
        "reason",
    ]
    with path.open("w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(samples)
    return {
        "outcome": "ready"
        if any(s["flux_uJy"] is not None for s in samples)
        else "no_usable_samples",
        "samples": samples,
        "nominal_channels": 102,
        "missing_channels": "unmeasured_not_interpolated",
        "epochs_kept_separate": True,
        "brightness_comparisons": comparisons,
        "csv_artifact_index": artifact(
            path, "spectrum_csv", [s["metadata"]["product_id"] for s in sources]
        ),
    }
