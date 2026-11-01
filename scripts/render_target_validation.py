"""Render inspectable scientific contact sheets from the verified immutable preview bytes."""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from astropy.io import fits
from astropy.wcs import WCS
from matplotlib.patches import Circle

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/verification/targets"


def main():
    for path in sorted(OUTPUT.glob("*.json")):
        report = json.loads(path.read_text(encoding="utf-8"))
        if "identity" not in report:
            continue
        candidates = [c for c in report["cases"] if c["status"] == "succeeded"]
        if not candidates:
            continue
        case = max(candidates, key=lambda c: len(c.get("common_delivery", [])))
        frames = case["common_delivery"]
        if not frames:
            continue
        fig, axes = plt.subplots(1, len(frames), figsize=(4.6 * len(frames), 5.5), squeeze=False)
        wcs = WCS(fits.Header.fromstring(case["preparation"]["grid"]["header"], sep="\n")).celestial
        for ax, frame in zip(axes[0], frames, strict=True):
            ax.set_facecolor("black")
            ax.imshow(plt.imread(ROOT / frame["preview_path"]), origin="upper")
            diagnostic = min(
                case["frames"],
                key=lambda r: abs(
                    float(r["diagnostic"]["mid_mjd_utc"]) - float(frame["time"]["mid_mjd_utc"])
                ),
            )["diagnostic"]
            prediction = diagnostic["prediction"]
            x, y = map(
                float, wcs.world_to_pixel_values(prediction["ra_deg"], prediction["dec_deg"])
            )
            height, width = case["preparation"]["grid"]["shape"]
            if 0 <= x < width and 0 <= y < height:
                ax.add_patch(Circle((x, height - 1 - y), 1.5, fill=False, color="orange", lw=1))
            wave = diagnostic["target_local_wavelength_um"]
            label = (
                f"target wavelength proxy: {wave:.3f} µm"
                if wave is not None
                else "target wavelength unavailable"
            )
            ax.set_title(frame["time"]["label_utc"] + "\n" + label, fontsize=8)
            ax.set_xticks([])
            ax.set_yticks([])
        comparisons = case["comparisons"]
        expected = max(
            (
                c["expected_tangent_motion_arcsec"]
                for c in comparisons
                if c["expected_tangent_motion_arcsec"] is not None
            ),
            default=None,
        )
        claim = (
            f"Expected sampled proper-motion shift ≤ {expected:.4f} arcsec; measured motion/variability unvalidated"
            if expected is not None
            else "Proper-motion shift unavailable; measured change unvalidated"
        )
        fig.suptitle(
            report["identity"]["name"] + " — AegisEarth real SPHEREx sky-fixed previews",
            fontsize=12,
        )
        fig.text(
            0.5,
            0.055,
            claim
            + "\nShared asinh; strict masks. Orange circle: approximate catalog prediction, not a detection.",
            ha="center",
            fontsize=9,
        )
        fig.tight_layout(rect=[0, 0.12, 1, 0.94])
        fig.savefig(OUTPUT / (report["target"] + ".png"), dpi=120)
        plt.close(fig)
        print("Rendered", report["target"], flush=True)


if __name__ == "__main__":
    main()
