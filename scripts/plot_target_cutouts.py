"""Scientific native-data previews; no fake candidates, registration or photometry."""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from astropy.io import fits
from matplotlib.colors import AsinhNorm

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/research/target_feasibility"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target")
    args = parser.parse_args()
    data = json.loads((OUTPUT / "inspection_report.json").read_text())
    if args.target is None:
        # A fresh renderer per sheet avoids cross-figure font/extent-cache clipping.
        for target in data["targets"]:
            subprocess.run(
                [sys.executable, str(Path(__file__).resolve()), "--target", target["target"]],
                check=True,
                timeout=45,
            )
        print("Saved five real-data pair previews")
        return
    directory = OUTPUT / "figures"
    directory.mkdir(exist_ok=True)
    for target in data["targets"]:
        if target["target"] != args.target:
            continue
        selected_ids = set(target["best_sampled_pair"]["observation_ids"])
        samples = [
            sample
            for sample in target["samples"]
            if sample["inspection"]["observation_id"] in selected_ids
        ]
        # Pair preview for readability; every inspected input remains in the JSON report.
        arrays = [fits.getdata(ROOT / sample["local_path"], "IMAGE") for sample in samples]
        low, high = np.nanpercentile(np.concatenate([array.ravel() for array in arrays]), [2, 99.5])
        norm = AsinhNorm(linear_width=max((high - low) / 10, 0.001), vmin=low, vmax=high)
        columns = min(3, len(arrays))
        rows = (len(arrays) + columns - 1) // columns
        figure, axes = plt.subplots(
            rows,
            columns,
            figsize=(columns * 4.2, rows * 3.8),
            squeeze=False,
        )
        figure.subplots_adjust(
            left=0.08, right=0.87, bottom=0.15, top=0.76, wspace=0.35, hspace=0.5
        )
        for axis, sample, array in zip(axes.flat, samples, arrays, strict=False):
            inspection = sample["inspection"]
            image = axis.imshow(
                array, origin="lower", cmap="magma", norm=norm, interpolation="nearest"
            )
            axis.set_title(
                f"{inspection['mid_utc'][:10]}  D{inspection['detector']}\nλ={inspection['wavelength_um']:.5f} µm; usable {inspection['usable_fraction']:.0%}",
                fontsize=10,
            )
            axis.set_xlabel("Native x pixel (0-based)")
            axis.set_ylabel("Native y pixel (0-based)")
        for axis in list(axes.flat)[len(arrays) :]:
            axis.set_visible(False)
        colorbar_axis = figure.add_axes([0.9, 0.19, 0.02, 0.58])
        figure.colorbar(image, cax=colorbar_axis, label="Surface brightness (MJy/sr)")
        figure.suptitle(
            target["target"] + ": real native frames — unregistered / shared stretch",
            fontsize=13,
        )
        figure.savefig(
            directory / (target["target"] + ".png"),
            dpi=130,
            bbox_inches="tight",
            pad_inches=0.2,
        )
        plt.close(figure)
    print("Saved real-data pair preview:", args.target)


if __name__ == "__main__":
    main()
