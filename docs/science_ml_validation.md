# Scientific and model validation: viewer first

Revised 29 October 2026. The primary result is a public time sequence, not a classified candidate list.
Use the [five-target protocol](target_validation.md) and [challenge matrix](challenge_alignment.md).
Original image viewing, comparable time viewing, subtraction, photometry and inference need distinct
eligibility policies. The historical QR2 engineering preflight is useful regression evidence, not
science sign-off or a universal viewer gate.

## Viewer and change interpretation

| Confounder | Required control / user-visible interpretation |
| --- | --- |
| Local wavelength/response changes | Actual WCS-WAVE/response support per epoch/pixel; common supported band for motion playback; label mixed-band exploration |
| Registration drift | Independent stationary references, residual/centroid uncertainty and fixed orientation/grid; never align on the moving target |
| Independent per-frame stretches | Shared default intensity scaling; label alternate normalized display so brightness changes are not erased |
| Variable brightness | Matched band/epoch and photometry evidence; RW Aurigae/R Draconis need brightness tests, not forced motion labels |
| Bad pixels/contamination | Decoded flags/coverage and masks; informational SOURCE/FULLSAMPLE preserved; quality policy reviewed per release |
| PSF/calibration/background | Release-aware QR2 PSF versus QR3 ePSF, local references and operation-specific fits; inspect originals even if subtraction blocked |
| Unresolved blends/saturation | Report limitations for bright/crowded sources and Epsilon Indi B components; no invented component detections |
| Faint-source nondetection | Record WISE 0855 SPHEREx coverage/SNR limits; catalog/WISE context does not establish SPHEREx recovery |
| Catalog epoch mismatch | Preserve reference epoch/proper-motion convention/errors; label propagation/parallax/apparent-position limitations |
| Missing epochs or channels | Show gaps and actual observing times; no fake frames, inferred detections or filled-in spectra |

Frames are sky-fixed by default. Do not center each frame on a propagated target when demonstrating
its apparent motion. Actual cadence and elapsed gaps remain distinct from animation playback rate.
At least two independent observing epochs are needed for change; reprocessed copies of one exposure
do not count. The survey's nominal six-month repeat does not guarantee exact cadence for every patch.

## Detector composites and temporal coaddition

The six detector labels cover broad changing local responses; they are not six universal fixed filters.
For each detector/time bin define target wavelength support, weights and actual coverage. Compare
epochs with the same supported response policy, or label composites as exploratory and block quantitative
differences. Do not indiscriminately sum all 102 nominal channels or mix response support between dates.

For validated independent equal-response samples, weighted mean is sum(w_i I_i)/sum(w_i), with
w_i=1/variance_i and output variance 1/sum(w_i). A literal sum has sum-of-variance semantics and
different effective exposure/interpretation. Masks, overlap and resampling correlations require explicit
treatment; the simple independent formula is a tested reference, not a universal noise model.
Store contributor/count/weight/coverage/effective-response maps and original units. Pixels with no
support remain masked, never measured zero. Long temporal bins smear movers and dilute variability;
retain uncoadded frames and disclose the tradeoff.

## Difference imaging

Use later-minus-earlier sign convention. Validate local response, calibration, empirical registration,
background and local PSF/ePSF matching before subtraction. Propagate masks/variance and document
correlation after interpolation/convolution; raw pixel significance is not automatically a calibrated
detection significance. A residual may indicate flux variation, noise, blending or calibration error.
Ineligible subtraction returns reasons while the original movie remains available.

## On-demand spectra and brightness measurements

Baseline implementation choice is reviewed local per-epoch photometry using calibrated inputs and
appropriate ePSF/aperture corrections; evaluate official SPHEREx spectrophotometry tooling as a
reference or documented adapter. No undocumented GUI endpoint is a production dependency.

Define source aperture/PSF model, background estimation, pixel solid angle, calibration, response,
uncertainty and quality selection. IMAGE MJy/sr is surface brightness, not source flux: integrating
background-subtracted brightness over pixel solid angles requires the appropriate unit conversion and
aperture/PSF correction. Background uncertainty and correlated pixels must be included where relevant.
Validate against analytic sources and suitable official/reference extractions before publishing fluxes.

Keep spectra scoped to an epoch/time bin; do not construct a variable source's spectrum from unrelated
dates without labeling that model/assumption. For movers, use explicit per-epoch source positions and
their uncertainty so an aperture does not drift onto a different source. Return measured samples,
errors/flags/response and defensible upper limits, with gaps when unavailable; no fake 102-channel curve.

## Tests and review gates

- Execute all five named targets with retained query/frame/quality reports; preserve M101 as additional
  engineering control and 3I/ATLAS as optional follow-up, not replacements.
- Add generated static fields, known offsets/rotations, variable-only sources, blends, masked edges,
  cosmic-ray-like artifacts and controlled PSF/response changes; test analytic coadd/variance/flux units.
- Verify roundtrip WCS/pixel overlays, sky-fixed geometry and browser playback separately from numerical tests.
- Choose numeric response/coverage/registration/photometry tolerances from representative data and
  reviewer evidence. No universal sensitivity or SNR improvement is asserted before measurements.
- Separate target-test completion from a positive motion/variation recovery. Report missing coverage,
  nondetection and unresolved effects without claiming successful detection or hiding limitations.

## Optional researcher model

The researcher designs/trains/evaluates/calibrates and supplies the inference package. Backend
integration verifies goldens/parity, exact preprocessing, coordinate/score semantics, checksums,
resource limits and isolated errors. The viewer does not require a backend-built classical ranker,
automatic association/tracks or trained network. Keep such interfaces disabled until integrated.

Obtain model card, evaluation/split/leakage/failure evidence and calibration provenance with the
package; do not repeat model training as a backend deliverable. Uncalibrated outputs are candidate
scores, not probabilities, confirmation or Planet X discovery claims. [Model handoff](model_handoff.md)
defines the integration contract. Inference unavailability must not disable browsing, spectra or overlays.
