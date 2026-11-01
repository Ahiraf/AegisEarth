"""Inspect real derived previews and sparse epoch-specific spectra, without connecting missing samples."""

import json
from io import BytesIO
from pathlib import Path

import httpx
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def main():
    evidence = json.loads(
        (ROOT / "docs/verification/derived_operations.json").read_text(encoding="utf-8")
    )
    coadd = next(
        r["report"]
        for r in evidence["operations"]
        if r["report"]["kind"] == "coadd" and r["report"]["outcome"] == "ready"
    )
    spectrum = next(
        r["report"] for r in evidence["operations"] if r["report"]["kind"] == "spectrum"
    )
    groups = [g for g in coadd["groups"] if g["status"] == "ready"]
    fig, axes = plt.subplots(1, len(groups), figsize=(4.5 * len(groups), 4.8), squeeze=False)
    with httpx.Client(base_url="http://127.0.0.1:18000", timeout=30) as c:
        for ax, g in zip(axes[0], groups, strict=True):
            artifact = coadd["artifacts"][g["artifact_indices"]["preview"]]
            response = c.get(f"/api/v1/artifacts/{artifact['id']}/content")
            response.raise_for_status()
            ax.set_facecolor("black")
            ax.imshow(Image.open(BytesIO(response.content)))
            ax.set_title(
                f"MJD {g['start_mjd']:.6f}\n{g['unit']}; {len(g['indices'])} contributor(s)",
                fontsize=9,
            )
            ax.set_xticks([])
            ax.set_yticks([])
    fig.suptitle("AegisEarth — real D6 display composites (shared stretch)")
    fig.text(
        0.5,
        0.035,
        "Count-one epochs do not claim a coaddition SNR gain. Masks retained; response/PSF/covariance science approval unavailable.",
        ha="center",
        fontsize=8,
    )
    fig.tight_layout(rect=[0, 0.09, 1, 0.94])
    fig.savefig(ROOT / "docs/verification/coadd_preview.png", dpi=120)
    plt.close(fig)
    fig, ax = plt.subplots(figsize=(8.5, 4.8))
    for s in spectrum["samples"]:
        if s["flux_uJy"] is None:
            continue
        ax.errorbar(
            s["wavelength_um"],
            s["flux_uJy"],
            xerr=s["bandwidth_um"] / 2,
            yerr=s["flux_error_uJy"],
            fmt="o",
            capsize=3,
            label=s.get("observed_at_utc", s["mid_mjd_utc"]),
        )
    ax.set_xlabel("Native WCS-WAVE center proxy (micron); horizontal bars: half width")
    ax.set_ylabel("PSF-corrected aperture diagnostic (microJy)")
    ax.set_title("AegisEarth — sparse real samples, distinct observing epochs")
    ax.legend(title="UTC / original UTC MJD", fontsize=8)
    ax.grid(alpha=0.2)
    fig.text(
        0.5,
        0.025,
        "No interpolation or single-epoch spectrum implied. Error bars are diagonal/background proxies; no calibrated variability claim.",
        ha="center",
        fontsize=8,
    )
    fig.tight_layout(rect=[0, 0.07, 1, 1])
    fig.savefig(ROOT / "docs/verification/spectrum_samples.png", dpi=140)
    plt.close(fig)


if __name__ == "__main__":
    main()
