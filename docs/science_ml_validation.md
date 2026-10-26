# Scientific processing and ML validation plan

The system prioritizes candidate changes for human inspection. It does not confirm new objects,
solve orbits, identify Planet X or infer physical impact danger from image residuals.

## False-positive controls

| Confounder | Required evidence/control |
| --- | --- |
| Different wavelength response | Local wavelength/bandwidth and source color context; reject unsupported comparisons |
| Registration error | Residuals from stationary sources; centroid errors; reject poor/common-mode shifts |
| Different PSF/photometric calibration | Appropriate local PSF/ePSF matching, background/flux diagnostics and calibration provenance |
| Variable brightness | Same-position source match with intensity change; distinguish from displacement hypothesis |
| Cosmic-ray-like events/bad pixels | Quality flags, morphology, per-epoch support and optional repeated observations |
| Saturation/edges/gaps/NaN | Masks, coverage, boundary proximity and explicit quality warnings |
| Blends/crowding | Ambiguous-association flag, source morphology, multiple hypotheses and lower confidence |
| Resampling/convolution noise | Propagated variance, noise correlation caveat and empirical control/injection calibration |

SPHEREx has a position-dependent wavelength response; comparisons cannot be justified solely by
matching a broad detector label. Use the [IRSA overview](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/overview.html)
and [data-product guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/)
to identify appropriate wavelength, quality, uncertainty and calibration information.

## Scientific baseline

Start with validated source detection, registration, difference imaging and explainable feature ranking.
Keep the baseline executable as a reference when adding a CNN/Siamese ranker. Choose scientific thresholds
from representative controls/injection tests; this scaffold does not invent validated numeric cutoffs.

Two epochs produce possible motion evidence. Three or more may support a tentative trajectory over the
observed baseline, subject to association/model limits. Confirmation requires additional evidence/review.
A stationary variable, noise spike or subtraction artifact remains a separate interpretation.

## Training and model integration

The ML researcher owns model design, training, evaluation and calibration, and supplies the complete
inference package. The backend developer owns its adapter, inference parity, resource limits, job/API
integration, storage, deployment and provenance. Training/retraining is not a backend delivery task.
The researcher is expected to provide evidence of the following with the model, rather than asking the
backend developer to repeat the training workflow:

1. Define a label guide, annotator/review process and uncertain cases.
2. Assemble permitted-use real examples and realistic synthetic injections; retain origin labels.
3. Split data by sky field/source/sequence and observing epoch before making overlapping stamps.
4. Use identical transforms/channel order at training and inference; retain original-image context.
5. Train one compact CNN or Siamese model and compare it with the baseline under identical test conditions.
6. Record data/code/config/weights checksums, seeds, dependencies, license and inference hardware.
7. Evaluate held-out performance and out-of-domain behavior; record failure examples, not only aggregate accuracy.
8. Calibrate and label probabilities only if representative labeled evaluation supports them.

Injection recovery demonstrates sensitivity to the injection assumptions. It does not alone establish
real-world precision or discovery rate. Known-object ephemeris matches can provide supporting labels,
but are not mandatory primary data integrations and must include their own time/frame uncertainties.

## Metrics and acceptance targets

The researcher supplies precision-recall curves, false positives per field, recovery versus motion/brightness/SNR,
association errors, calibration error/reliability when applicable and CPU/memory/inference latency.
Partition results by wavelength regime, crowding, masks, release, baseline and source morphology.
Do not use pixel accuracy as the only metric or mix neighboring cutouts across train/test splits.

Before acceptance, the team/scientific reviewer must set numeric thresholds using real-data feasibility
results. Until then, all numeric ML quality targets are TBD, and no “95% accurate” or “95% certain” claim
is justified. The default output remains candidate_score with method/version and explanation codes.

## Model card required before enabling trained ranking

- Intended use and explicitly unsupported uses.
- Data/label source, license, split policy and known biases.
- Architecture, preprocessing, version, weights checksum and reproducibility record.
- Held-out baseline/model comparisons and subgroup failure examples.
- Score meaning, calibration dataset/version, uncertainty and decision thresholds.
- CPU/GPU requirements, time/memory limits and supported input shape/channel order.
- Reviewer, approval status and rollback/disable procedure.

The ranker schema's calibration-reference guard is a software check, not a substitute for this evidence.
Backend integration checks reference outputs and operational behavior against the supplied package;
it does not certify new model accuracy. See [handoff and acceptance](model_handoff.md).
