# Step 1 — five-target native-data feasibility

Captured/inspected 29 October 2026. **Real multi-epoch native inputs were obtained for all five
required fields.** This completes source/identity/quality feasibility, not the later public viewer,
registered movies, measured motion, variability, calibrated photometry or scientific approval.

## Evidence

- [Catalog source receipt](astrometry_receipt.json), [raw TAP response](simbad_response.json) and
  per-object ASCII/epoch receipts in `catalog/`; all five positions explicitly declare ICRS epoch J2000.
- [Discovery report](discovery_report.json): 20 bounded queries across QR3/QR2 wide/deep; full raw XML
  and exact URLs/times/hashes/status/fields in `metadata/`. All requests succeeded; OVERFLOW remains incomplete.
- [Cutout manifest](cutouts_manifest.json): **27** native 3-arcmin requests, **119,249,280 bytes** total,
  exact source/product metadata, fixed sky centers, completion timestamps, sizes and SHA-256.
- [Inspection/comparison report](inspection_report.json): all HDUs, units/time scales, QR2 PSF/QR3 ePSF,
  flags/variance/local wavelengths, native scales, diagnostic source-aperture support and pair metrics.
- [Follow-up selection](followup_selection.json): footprint-geometry download heuristic. The heuristic
  is not wavelength truth; actual FITS lookup/overlap checks determine the reported outcome.
- Five real-data preview sheets in `figures/`, visually inspected. These use shared intensity stretch
  per target but remain native/unregistered and mix sampled wavelengths with explicit labels.

## Actual findings

| Target | Sample / release | Longest sampled span | Finding and next scientific constraint |
| --- | --- | --- | --- |
| Barnard's Star | 6 D2 QR3 cutouts, ePSF table | 9.299 days | Native field available; bright target aperture is conservatively masked. No sampled pair reaches the 90% local interval proxy. More suitable epochs/response and bright-source treatment needed for motion measurement. |
| Epsilon Indi B | 5 D6 QR2 cutouts, legacy PSF | 367.535 days | System B identity retained, separately compared to the primary catalog record; not a Ba/Bb resolution claim. Strong aperture contrast is diagnostic only; no sampled pair reaches the 90% local interval proxy. |
| WISE 0855 | 6 D6 QR2 cutouts, legacy PSF | 181.796 days | Faint/noisy native field. A follow-up pair separated by 8.214 days has minimum local interval proxy 99.878%; common conservative usable coverage is only 76.58%. No validated target detection or motion claim. |
| RW Aurigae | 4 D2 QR3 cutouts, ePSF table | 4.958 days | Native repeated field available, with changing spectral response/flags and one unsupported masked aperture. Best long-span proxy is about 70%; brightness variation has not been established. |
| R Draconis | 6 D1 QR3 deep cutouts, ePSF table | 15.817 days | Bounded QR3 sample contains D1/D4, not D2; selected available D1 explicitly. A 2.654-day pair has minimum local interval proxy 99.410%; usable common coverage 77.17%, and the target aperture is flagged. No photometric variability claim. |

The 90% interval threshold is a development diagnostic, not a science-approved policy. Passing that
one gate does **not** mean passing full compatibility: WISE/R Draconis also fall below the earlier
80% common-coverage development guard. Preserve requested output FOV by acquiring padded inputs
at later processing stages; do not silently crop or lower thresholds to manufacture success.
The older [M101 pair](../README.md) remains the existing positive engineering-control fixture.

## Astrometry, resolution and quality interpretation

The challenge's WISE coordinate is retained separately with **unknown supplied epoch**. Current
search centers use an explicit approximate proper-motion offset from the verified J2000 catalog
position to 2026-01-01. Each cutout stays centered on that same sky coordinate; predicted source
positions at each observing time are used only for diagnostic apertures. No image is recentered on
the target. The prediction omits observer-dependent parallax/radial-velocity effects and is not measured astrometry.

The report includes expected catalog shift versus native pixel scale for each selected pair. Tiny
predicted displacements over short baselines cannot be advertised as visibly recovered motion.
The roughly 6.15-arcsec native sampling and empirical registration/PSF uncertainty still matter.

The conservative aperture proxy uses a 1.5-pixel radius and a 4–10-pixel background annulus with
variance/background noise. It is **not** aperture-corrected flux, an ePSF fit, a calibrated significance,
or a confirmed detection; masked apertures return null rather than fake zero/SNR. Heavy source flags,
low SNR, changing local wavelengths, background and PSF differences need operation-specific review.

QR2 flag definitions use MP_* bit-index cards. QR3 uses MSKN names plus MSKM bit masks and includes
additional crosstalk/streak definitions. Readers normalize these explicitly and retain SOURCE/FULLSAMPLE
as informational. QR3 ePSF is a 441-row table with 33×33 model arrays in this sample; QR2 uses the
121×101×101 legacy PSF cube. Reference selection is not empirical PSF matching or calibration certification.

## Reproduce

From repository root using the backend Python environment (research extra for plots):

```powershell
# Explicit live rebuild of catalog snapshots; review identity/epoch changes before reusing fixtures.
.\backend\.venv\Scripts\python scripts/capture_target_catalog.py
.\backend\.venv\Scripts\python scripts/capture_target_metadata.py
.\backend\.venv\Scripts\python scripts/capture_target_cutouts.py
# Optional bounded follow-up selected by footprint geometry, then actual FITS validation.
.\backend\.venv\Scripts\python scripts/refine_target_pairs.py
.\backend\.venv\Scripts\python scripts/capture_target_cutouts.py
# Offline once the hash-pinned raw files exist.
.\backend\.venv\Scripts\python scripts/profile_target_cutouts.py
.\backend\.venv\Scripts\python scripts/plot_target_cutouts.py
```

Metadata/cutout capture reuses verified receipts/cache rather than silently treating files as new
downloads. Raw FITS remain ignored under `var/research/targets/`; small metadata receipts and derived
reports/previews are reviewable in Git. Sources can reprocess or retire products; changed bytes require
explicit review/new provenance, not a claim of scientific change. Public source/acknowledgement guidance
is recorded in [the source register](../../sources_and_challenge.md).

These are step-1 investigations. The later [five-target public-viewer acceptance](../../target_validation.md)
still needs registration, actual React playback, eligible spectral grouping/photometry and measured evidence.
Do not label all five targets as successful motion/variable-source recoveries.
