# Compatibility policy v1 — engineering preflight

Historical QR2 development policy. The 29 October viewer plan separates native display, comparable
movie, coadd/difference and photometry eligibility; this policy is not a universal viewer gate.
See [current scientific validation](../science_ml_validation.md). Recorded measurements are unchanged.

Version: `engineering-preflight-v1`, 26 October 2026. Implemented in the feature-specific offline
`observations/feasibility.py` and `comparisons/feasibility.py` helpers. Applied to the three pinned
real cutouts, not exposed as a production API. Thresholds are explicit development choices, not
scientific sign-off, trained-model thresholds, completeness claims or discovery confidence.

## Gates and rationale

| Gate | Development threshold | Why / remaining validation |
| --- | --- | --- |
| Identity | Distinct observation IDs; same QR2 collection, detector, pipeline version and processing family | Avoid accidental self-comparison and mixing releases; not proof of all calibration-asset equivalence |
| Time | Explicit UTC FITS metadata; absolute midpoint separation ≥60 seconds | Reject duplicate/nearly identical epochs; not an optimal motion cadence or a guarantee of detectability |
| Required inputs | IMAGE, FLAGS, VARIANCE, ZODI, PSF, WCS-WAVE; 2D science grid ≤512 pixels per side | Fail clearly on a different format; this inspector intentionally supports the QR2 sample only |
| Units | IMAGE MJy/sr; VARIANCE (MJy/sr)² | Prevent dimensional misuse |
| Input quality | Each image ≥90% usable pixels, finite science, finite positive variance, known flags | Retain enough of a tiny cutout for development; survey/science acceptance needs validation |
| Common coverage | ≥80% of reference pixels geometrically covered and conservatively usable in both images | Avoid a misleading tiny common subset; denominator is the full reference grid |
| Local spectrum | Minimum FWHM-interval overlap proxy ≥90% over the common usable region | Test local wavelength compatibility instead of broad detector labels; full response curves still required |
| Center shift | Absolute local target wavelength difference ≤0.1 × smaller FWHM | Additional central guard; this number does not establish spectral equivalence |
| PSF availability | Finite selected PSF plane; corrected header (6.5.6+, or documented 6.4–6.5.5 +psffix1) | Detect the known header problem; not a PSF-fit or ePSF adequacy assessment |
| Unknown metadata | Missing required fields/unsupported time units/invalid bandwidth raise errors; unknown flags fail coverage | Fail closed rather than fabricate defaults |

`MP_SOURCE` and `MP_FULLSAMPLE` are informational. Other declared flags are masked, including
halo/persistence/transients. Unknown bits are masked and also block acceptance. This deliberately
conservative policy needs science review before deployment; masking a transient does not label it
as a real mover or a false positive.

## Definitions

For local wavelength center λ and FWHM width w, define the interval I = [λ − w/2, λ + w/2].
The overlap proxy is `length(Ia ∩ Ib) / min(wa, wb)`, clamped below at zero. It is **not** an
integrated transmission overlap. Widths must be finite and positive. Evaluate at the target and,
using each image's WCS-WAVE lookup, across each common usable reference-pixel sky coordinate.

Map every reference native pixel through its celestial WCS to the second native grid. A point is
geometrically covered only if all four surrounding interpolation neighbors exist. Common usable
coverage also requires the reference pixel and all four neighbors to pass the mask. No interpolation
of intensities is performed here. This yields a conservative 353/400 positive-pair coverage result;
future resampling must propagate masks and variance with a scientifically reviewed kernel.

Keep original start/mid/end strings and original MJD strings; use Astropy UTC arithmetic for elapsed
seconds. Pixel coordinates returned by `world_to_pixel` are 0-based; source footprints are ICRS
polygons retained from SIA. Parent-pixel mapping follows the official PSF tutorial's CRPIX*A formula.
The nearest PSF zone is a reference selection, not interpolation or empirical PSF matching.

## Measured outcome and blockers

The [report](data_path_report.json) records each check, measurement and blocking reason. The
repeat passes all development gates. The negative fails common coverage, local wavelength overlap
and center shift. No output contains a model score, candidate confidence or motion confirmation.

Before using scientific compatibility as an execution gate, validate at least:

- Full calibration provenance, spectral response assumptions and the newer ePSF path. Current IRSA
  guidance recommends newer ePSFs for science; QR2 legacy PSF availability alone is insufficient.
- Empirical star-based registration residuals and uncertainty, pixel scale/orientation, local PSF
  matching, photometric/background fit and detector-edge behavior.
- Stationary, variable-brightness, artifact and known-mover controls across realistic SNR/cadence;
  precision/recall and uncertainty reviewed by the ML researcher.
- Appropriate cadence/size/coverage thresholds for the actual motion range and model input contract.

No scientific reviewer approval has been recorded. Keep later production comparisons and science
acceptance tasks open until this evidence exists; do not interpret development GO as detection GO.
