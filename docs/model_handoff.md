# ML researcher to backend: model handoff and acceptance

Scope update, 29 October 2026: inference is an optional enhancement after the coordinate-driven
SPHEREx time viewer. Core/expanded challenge releases do not depend on model delivery, classical
ranking or automatic tracks. Keep existing interfaces disabled until integration evidence exists;
model failure must not disable playback, spectra or survey context. This contract applies when the
researcher's package is integrated and does not assign backend training work.

The ML researcher will build/train the main AegisEarth model and deliver a completed inference
package. The backend developer integrates and operates it. Model architecture research, data labeling,
training, tuning, calibration and retraining are not backend deliverables.

## Ownership

| Work | Owner |
| --- | --- |
| Architecture, training data/labels, training and hyperparameters | ML researcher |
| Scientific evaluation, calibration, supported conditions and limitations | ML researcher; scientific review where needed |
| Weights/export, exact transforms, inference example and reference outputs | ML researcher |
| Observation acquisition and processing outside the delivered package | Backend developer, against agreed scientific contracts |
| Model loading adapter, API/jobs, storage, caching and deployment | Backend developer |
| Golden-output parity, error handling, latency/memory and worker integration | Backend developer, with researcher resolving prediction mismatches |
| Public viewer and presentation | Frontend developer using backend evidence contracts |

## 1. Agree what the model actually accepts

Do this before implementing overlapping processing. “Complete model” must identify its boundary:

- Raw FITS/image pair plus metadata?
- Registered/calibrated image pair with masks/variance?
- Difference stamps and per-epoch stamps?
- Candidate features, or complete detection/association outputs?

Map the delivered inference package to the logical pipeline stages. A researcher-provided package
that includes detection/preprocessing should be reused through adapters, not reimplemented independently.
If the package only ranks stamps, the backend still needs the upstream candidate-generation stages.
The ranking-only protocol is an initial scaffold, not a requirement that the researcher change his architecture.

## 2. Required delivery package

| Item | Required information |
| --- | --- |
| Model artifact | Versioned weights or executable export; SHA-256; immutable location; format and permitted use |
| Loading/inference | Architecture/loading code where needed; runnable `predict` example; expected output on supplied inputs |
| Environment | Python/framework/library versions; OS support; CPU/GPU/CUDA requirements; inference dependency lock/container if available |
| Inputs | Number/order of epochs, shape/layout (NCHW/NHWC), dtype, channels, units, masks, metadata, coordinate/time conventions and supported sizes |
| Preprocessing | Resize/crop/reprojection, wavelength policy, normalization, clipping, missing-value rules, background/PSF and any learned transforms |
| Outputs | Shapes, class-index mapping, coordinates/units, score meaning, logits versus probabilities, thresholds, postprocessing and uncertainty |
| Golden cases | Representative valid inputs, expected outputs and agreed absolute/relative tolerances; edge/invalid cases and expected failures |
| Model card | Intended use, training/evaluation source/split summary, limitations, metrics and domain-shift evidence |
| Calibration | Explicit calibrated/uncalibrated state; calibration reference/version only if supported by evaluation |
| Resources | Batch/concurrency limits, memory, initialization time and measured latency on identified hardware |

A weights file alone is insufficient when architecture, transforms or label interpretation are missing.
The backend does not need the entire training dataset/repository to deploy, but needs enough evaluation,
provenance and inference material to reproduce and interpret the provided model responsibly.

## 3. Backend integration sequence

1. Record the package version/checksum and inspect its documented input boundary/dependencies.
2. Run the researcher's inference example unchanged on the golden cases in an isolated project environment.
3. Resolve unclear transforms/output semantics with the researcher; do not guess normalization or thresholds.
4. Implement the backend adapter and candidate/evidence mapping. Keep raw model outputs inspectable where appropriate.
5. Compare adapter outputs with reference outputs within the agreed tolerances, including batching/device behavior.
6. Pin inference dependencies and repeat parity in the Docker worker image.
7. Load once per worker; handle initialization failure, corrupt/missing artifact, timeout and insufficient memory explicitly.
8. Version the model together with preprocessing/postprocessing and propagate those versions into every result.
9. Run a full compatible-image analysis and verify artifact/coordinate/score delivery to the frontend contract.
10. Enable the model only after parity, resource and operational checks pass; retain a rollback/disable path.

Do not expose training through API requests, select a framework before the package arrives, or silently
replace an unavailable model with another method. A demo baseline may remain an explicitly selected mode.

## 4. Acceptance checklist

- [ ] Input/output boundary and stage ownership agreed with researcher.
- [ ] Versioned artifact, inference code/export, dependency specification and permitted use received.
- [ ] Exact transforms and class/score/coordinate semantics received.
- [ ] Golden inputs/outputs/tolerances and model card/evaluation summary received.
- [ ] Reference inference reproduced locally and in the deployment image.
- [ ] Adapter parity, batching, failures and CPU/GPU resource limits tested.
- [ ] Calibration labels match supplied evidence; uncalibrated outputs remain candidate scores.
- [ ] Model/config/checksums and limitations are recorded in result provenance.

Status: ownership confirmed by the user; the model package and its exact interface have not yet been supplied.
No model framework, architecture, accuracy or delivery date is assumed by this contract.
