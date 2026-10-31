"""Reproduce five-target native-data inspection and comparisons offline from pinned files."""

import itertools
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from research_io import sha256

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.modules.observations.feasibility import (
    interval_overlap_fraction,
    measure_pair_geometry,
)
from app.modules.observations.products import inspect_product
from app.modules.targets.catalog import load_targets

OUTPUT = ROOT / "docs/research/target_feasibility"


def main():
    manifest = json.loads((OUTPUT / "cutouts_manifest.json").read_text())
    targets = {target.slug: target for target in load_targets()}
    inspected = []
    for receipt in manifest["cutouts"]:
        path = ROOT / receipt["local_path"]
        if sha256(path) != receipt["sha256"]:
            raise ValueError("Pinned input bytes changed")
        with fits.open(path) as hdus:
            instant = hdus["IMAGE"].header["DATE-AVG"]
        prediction = targets[receipt["target"]].search_position(instant)
        summary = inspect_product(path, receipt["fixed_sky_center"], prediction)
        inspected.append(
            {**receipt, "inspection": summary, "target_position_prediction": prediction}
        )
    reports = []
    for slug, target in targets.items():
        samples = [row for row in inspected if row["target"] == slug]
        pairs = []
        for left, right in itertools.combinations(samples, 2):
            a, b = left["inspection"], right["inspection"]
            elapsed = abs(
                float(
                    (Time(b["mid_utc"].removesuffix("Z")) - Time(a["mid_utc"].removesuffix("Z"))).jd
                )
            )
            geometry = measure_pair_geometry(ROOT / left["local_path"], ROOT / right["local_path"])
            center_overlap = float(
                interval_overlap_fraction(
                    a["wavelength_um"],
                    a["bandwidth_um"],
                    b["wavelength_um"],
                    b["bandwidth_um"],
                )
            )
            pairs.append(
                {
                    "observation_ids": [a["observation_id"], b["observation_id"]],
                    "epoch_separation_days": elapsed,
                    "center_interval_overlap_proxy": center_overlap,
                    "expected_catalog_shift_arcsec": float(
                        np.hypot(target.pm_ra_cosdec_mas_yr or 0, target.pm_dec_mas_yr or 0)
                        * elapsed
                        / 365.25
                        / 1000
                    ),
                    "geometry": geometry,
                    "engineering_band_overlap": geometry["minimum_local_interval_overlap"] >= 0.9,
                    "empirical_registration_validated": False,
                    "motion_or_variability_measured": False,
                }
            )
        best = max(
            pairs,
            key=lambda pair: (
                pair["engineering_band_overlap"],
                pair["epoch_separation_days"],
            ),
        )
        best["expected_shift_native_pixels"] = best["expected_catalog_shift_arcsec"] / float(
            np.mean(samples[0]["inspection"]["pixel_scale_arcsec"])
        )
        identity_context = {}
        if slug == "epsilon-indi-b":
            receipt = json.loads((OUTPUT / "astrometry_receipt.json").read_text())
            primary = next(row for row in receipt["rows"] if row["main_id"] == "* eps Ind")
            separation = SkyCoord(target.ra_deg, target.dec_deg, unit="deg").separation(
                SkyCoord(primary["ra"], primary["dec"], unit="deg")
            )
            identity_context = {
                "primary_id": primary["main_id"],
                "primary_separation_arcsec": float(separation.arcsec),
                "selected_system_id": target.canonical_id,
                "components_individually_resolved": False,
            }
        reports.append(
            {
                "target": slug,
                "canonical_id": target.canonical_id,
                "identity_context": identity_context,
                "longest_sampled_baseline_days": max(
                    pair["epoch_separation_days"] for pair in pairs
                ),
                "samples": samples,
                "best_sampled_pair": best,
                "comparisons": pairs,
                "outcome": "real_multi_epoch_native_inputs_inspected",
                "limitations": [
                    "Bounded metadata sample may overflow; no full-survey cadence claim",
                    "FWHM interval is only a response proxy, not full spectral equivalence",
                    "Aperture contrast SNR is diagnostic, not validated detection/photometry",
                    "Proper motion prediction omits parallax/observer effects",
                    "No registered movie, measured motion, variability or model result",
                ],
            }
        )
    result = {"generated_at_utc": datetime.now(UTC).isoformat(), "targets": reports}
    (OUTPUT / "inspection_report.json").write_text(
        json.dumps(result, indent=2, allow_nan=False) + "\n"
    )
    for report in reports:
        best = report["best_sampled_pair"]
        print(
            report["target"],
            "days",
            round(best["epoch_separation_days"], 3),
            "band gate",
            best["engineering_band_overlap"],
            "snr proxies",
            [row["inspection"]["aperture_contrast_snr_proxy"] for row in report["samples"]],
        )


if __name__ == "__main__":
    main()
