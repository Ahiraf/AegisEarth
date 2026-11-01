# Steps 7–8: coadds, signed-difference gates and spectrum jobs

Implemented backend contract: `derived-v1`, processing version `derived-v1.1`. Playback remains independent.
These operations use committed numeric FITS data, never PNG pixels. Feature routes/schemas/pipelines live
in `coadds`, `differencing`, `comparisons` and `spectra`; `analyses` shares admission/worker protocol only.

## Public API and lifecycle

| Route under `/api/v1` | Implemented behavior |
| --- | --- |
| GET `/views/{id}/coadds/options` | All D1–D6 options and actual acquired frame indices; absent detectors are labeled |
| POST `/views/{id}/coadds` | Detector/epoch composites, explicit temporal means or weighted sums |
| POST `/comparisons/validate` | Operation-specific reasons for allowing/blocking a signed difference |
| POST `/views/{id}/differences` | Frozen later-minus-earlier job, producing an ineligible report when science gates fail |
| POST `/views/{id}/spectra` | Bounded native-grid point-source aperture extraction at fixed or per-epoch positions |
| GET `/coadds/{id}`, `/differences/{id}`, `/spectra/{id}` | Immutable result, data outcome, quality limits, lineage and artifact references |
| GET `/jobs/{id}`; POST `/views/{id}/cancel` | Shared job status and creator-capability cancellation |
| GET `/artifacts/{id}/content`, `/artifacts/{id}/science.fits` | Verified CSV/JSON/FITS/PNG and primary-2D science FITS |

Initialize the same public session as views; preserve its HttpOnly cookie and send a UUID `Idempotency-Key`.
Admission returns 202 (or 200 for reuse), with ID/status/result URLs. Only the creator gets the private
cancel token; never put it in URLs. A same-key/body retry is replayed before source lookup. Changed
requests conflict. Pending result GETs return 202 + Retry-After; unknown/wrong-kind IDs return 404,
failed/canceled jobs 409, and expired results 410. Results/status are no-store; bytes use existing ETags.

Each input is `{ "view_id": "UUID", "index": 0 }`, where index is a **preparation-report frame index**,
not a movie ordinal (movie sorting/binning can differ). The path view must be one input. At most six
unexpired source views and twelve distinct physical exposure/detector inputs are accepted. Duplicate
reprocessing is rejected. Sources must have more than fifteen minutes of retention remaining to cover
the bounded queue deadline; otherwise resubmit the source view before requesting a new derived operation.
An idempotent retry of an already admitted request still returns its existing receipt.
Coadd/difference sources require identical fixed grids/regions; spectra use
each original native WCS. One source view commonly supplies only one detector: acquire the other
detectors with explicit view-v2 requests for the same region and pass those additional frame references.

Example coadd body (replace the UUID with an unexpired source view):

```json
{
  "contract_version": "coadd-v1",
  "inputs": [{"view_id": "00000000-0000-0000-0000-000000000001", "index": 0}],
  "detector": "D6",
  "mode": "detector_composite",
  "epoch_window_seconds": 300,
  "wavelength_min_um": 4.4,
  "wavelength_max_um": 5.0,
  "minimum_contributors": 1
}
```

Difference requests use `difference-v1` with exactly two distinct inputs; validation uses `comparison-v1`.
Input order does not change the sign: actual observing midpoints determine later minus earlier.

Spectrum example:

```json
{
  "contract_version": "spectrum-v1",
  "inputs": [{"view_id": "00000000-0000-0000-0000-000000000001", "index": 0}],
  "epoch_positions": [{"view_id": "00000000-0000-0000-0000-000000000001", "index": 0, "ra_deg": 133.76, "dec_deg": -7.24}],
  "aperture_radius_pixels": 2.5,
  "background_inner_pixels": 4,
  "background_outer_pixels": 8
}
```

Alternatively supply one `position: {ra_deg, dec_deg}` for a fixed-sky extraction. Do not also supply
epoch positions. Moving sources require a complete explicit per-input position list; no unknown epoch,
proper motion or parallax is silently inferred. This coordinate is an illustrative value, not a WISE identification.

## Combination semantics and products

Detector composites group selected same-detector inputs into spans no longer than the requested 0–300 s.
They use a fixed requested wavelength-center window on the actual per-pixel WCS-WAVE maps. Each group
retains its exact contributor indices and time interval. A single contributor remains a count-one image,
with no claim of increased signal-to-noise. The original movie is unchanged.

Temporal means/sums intentionally span the selected epochs. Every pair must satisfy the existing same-
detector/release/processing-family, common-mask and local wavelength-interval display guards. Response
mismatch returns reasons rather than silently combining different colors. All combinations remain display
products: WCS-only alignment, unmodeled PSF/covariance and visualization-grade wavelengths are explicit.

For valid independent pixel inputs, normalized inverse-variance coefficients are `a_i=(1/v_i)/sum(1/v)`.
The mean is `sum(a_i*x_i)` with marginal variance `sum(a_i²*v_i)`. `weighted_sum` uses coefficients
`N_valid*a_i`; it is explicitly a count-scaled weighted sum, **not an exposure-normalized mean or an
unweighted sum**. Actual coefficients are exported. Unsupported/invalid pixels are excluded; minimum
contributor requirements produce missing pixels, never false zero measurements.

FITS products include SCIENCE, VARIANCE, VALID, COUNT, COVERAGE, per-input WEIGHTS, summed valid
EXPOSURE (seconds), wavelength-center/width proxies and min/max center-support maps, plus a contributor
table and spatial WCS. Weighted mean width is a descriptive proxy, not a measured effective transmission
function. Coadd groups share one asinh display scale. PNG alpha retains missing support.
Stacking across epochs can smear movers and dilute variability; every contributor interval is retained.

Signed-difference numerical code produces later−earlier, summed independent marginal variance, masks,
FITS lineage and a symmetric red-positive/blue-negative preview on eligible inputs. Its public gate
also requires quantitative response/calibration, independent registration and validated PSF support.
**Existing frames-v1 does not establish these conditions**, so current real-data difference requests
correctly produce `outcome=ineligible`, with no fabricated difference image. Passing an interval proxy
does not override CWAVE/CBAND, PSF/background/photometry or covariance requirements.

## Spectrum method and scientific boundary

IRSA's documented spectrophotometry tool uses forced Tractor fitting, measured PSFs, separate background
subtraction and pixel-solid-angle conversion. No documented callable submission API was verified during
this implementation; the public GUI is not called through an invented endpoint. Sources:
[IRSA method](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html),
[products/calibration](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/).

The implemented local method is a **diagnostic point-source PSF-corrected aperture extraction**:

1. Read unchanged native science/variance/flags at the explicitly selected epoch position.
2. Require an entirely usable circular aperture and a clean background annulus; exclude SOURCE flags
   from background pixels. Keep full pixel-flag counts and potential-blend information.
3. Select the spatial QR3 ePSF (5× sampling) or guarded QR2 legacy PSF (10× sampling). Map the normalized
   model into native pixels at the supplied subpixel location and compute the exact chosen aperture's
   model energy fraction. Unsupported or historically incorrect PSF headers yield unavailable samples.
4. Subtract a robust local median. Convert each native MJy/sr pixel to microJy with its spherical WCS
   quadrilateral solid angle and divide by the model aperture fraction. Merely summing MJy/sr is never
   labeled source flux. QR2 legacy PSF use is flagged; IRSA recommends newer ePSFs.
5. Propagate diagonal pixel variance plus an explicitly approximate robust median-background term.
   Covariance, PSF-model/calibration uncertainty, joint deblending and extended-source morphology are not
   independently validated; **real samples are labeled `diagnostic_only`, not science-approved spectra**.

JSON/CSV retain actual wavelength/width proxies, flux/error in uJy, UTC/MJD interval, epoch positions,
source hashes, PSF/background method and flags. Unusable/masked/out-of-coverage samples retain null
measurements and reasons. No formal upper limit is fabricated. Negative diagnostic flux is allowed.
Every epoch is separate; no interpolation creates a fake 102-channel spectrum. Brightness comparisons
retain wavelength overlap and blocking reasons; they do not turn cross-band differences into variability.

Science-grade CWAVE/CBAND maps, calibrated response/PSF/background/covariance acceptance, deblended
reference extractions and external scientific review remain explicit release gates. The numerical
method is tested against an independent pixel-integrated Gaussian reference; that does not certify
arbitrary crowded, variable, extended or saturated sky sources.

## Persistence, resource limits and reproduction

Additive `cosmic_0007` extends RPC/CSV publication without resetting tables or source views. Derived
requests reuse the existing sky-view job relations, shared admission counters, worker capacity and
upload-intent ledger. Source report, frame metadata and committed artifact records are compared in
PostgreSQL before atomic admission, including through the authenticated HTTPS repository. Worker
inputs are copied from verified objects; request bodies never supply a download URL, storage key,
scientific approval flag or executable model. The frozen source IDs, hashes and processing version
identify the cache; parent preparation hashes are retained for audit.

The existing isolated-process wall/CPU/RSS/disk/input-byte limits, fenced completion/cancellation,
24-hour retention and bounded cleanup apply. Raw inputs and prepared source grids are republished in
the derived job, preserving usable provenance after parent expiry. Reports reference artifacts by index
into their published `artifacts` list; bytes are at `/api/v1/artifacts/{id}/content`. No parent movie is modified.

```powershell
docker compose -f compose.foundation.yaml up -d --build
.\backend\.venv\Scripts\python scripts/verify_derived_operations.py
# Optional bounded archive probe for all six detector choices (may fail resource limits):
.\backend\.venv\Scripts\python scripts/verify_derived_operations.py --six-detectors
```

The verifier uses the existing unexpired WISE step-6 receipt for normal tests. Re-run target validation
if those inputs expired. [Executed evidence](verification/derived_operations.json) distinguishes real
outputs, refused operations, HTTPS parity and detector input availability. Native Gaussian/variance/
mask/shift controls and disposable PostgreSQL checks are in the backend suite. No production frontend
change, public deployment, ML training or external scientific sign-off is implied. The recorded live
probe produced D1/D2/D5/D6 outputs from retained inputs; fresh D3/D4 QR3 and QR2 downloads exceeded
the existing byte budget. These are separate sky fields and do not demonstrate a combined six-detector
image of one field. All six detector selectors pass numerical controls; complete live coverage remains open.
