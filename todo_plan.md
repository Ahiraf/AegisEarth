# Cosmic Motion AI — detailed backend delivery plan

Baseline: 26 October 2026. Product: AI-assisted identification of moving-source candidates in
SPHEREx images. Your ownership is the backend; frontend implementation is a separate team task.
The ML researcher owns the main model's design, training, evaluation and calibration. Your plan covers
receiving the supplied inference package, integrating it, verifying parity and operating inference.
Stack: FastAPI, PostgreSQL, Python scientific libraries, Docker, Hugging Face API deployment.

Checked boxes describe work actually present in the scaffold. All other items are future work.
No trained model, live discovery adapter, image pipeline or worker has been implemented yet.
Do not commit or push unless explicitly requested.

## Definition of done for every feature

Contract -> model/migration -> repository/storage adapter -> service/scientific function -> router or
worker stage -> unit/integration tests -> OpenAPI/examples -> frontend handoff -> measured acceptance.
Modules stay feature-based; scientific functions do not depend on HTTP handlers or ORM sessions.
Preserve source/product/calibration IDs, time scales, checksums and pipeline/model/config versions.

## 0. Replacement foundation

- [x] Remove obsolete backend domain modules, research scripts and fixtures; keep the frontend teammate's
      independently updated `frontend/` work when integrating with current GitHub main.
- [x] Create backend feature boundaries and an eleven-stage pipeline registry.
- [x] Add bounded observation/analysis request contracts and explicit unavailable responses.
- [x] Add seven-table metadata/job/result schema and a new Alembic baseline.
- [x] Add ranker interface and separate candidate score from calibrated probability.
- [x] Replace Docker/Compose/CI for a backend-only application and a fresh database namespace.
- [x] Rewrite SRS, README and backend planning/handoff documents.
- [x] Verify 16 local backend tests, migration roundtrip/schema drift in SQLite, lint, package installation,
      OpenAPI export, PostgreSQL SQL generation and Compose configuration.
- [ ] Verify full Compose startup and PostgreSQL migration roundtrip on Docker Desktop.
- [ ] Lock baseline dependencies reproducibly on the chosen Python version; review image/science library versions.
- [ ] Agree with frontend owner on public viewer flow, backend submission credentials and demo artifact contract.

Exit: API docs/health/capabilities run, fresh schema migrates, tests pass, and nobody mistakes scaffold endpoints for working analysis.

## 1. Prove the data and challenge path first (`observations`, `comparisons`)

- [ ] Read the complete official Planet X and SPHEREx brief/resources and current submission rules when accessible.
- [ ] Find real public observations of the same sky region at two or more useful epochs.
- [ ] Prefer one release; record collection, unique product IDs, detector, timestamps/scale, footprint and calibration.
- [ ] Confirm local wavelength/bandwidth overlap at the target location, not just common detector label.
- [ ] Inspect science, variance, flags, wavelength/WCS and PSF/ePSF references in a small real cutout.
- [ ] Identify a known mover example if possible and a stationary/control field; document the limits if none is available.
- [ ] Save a small permitted-use fixture manifest with exact query, retrieval time, checksums and expected fields.
- [ ] Verify access policy/attribution, download size and representative CPU/memory requirements.
- [ ] Produce a repeat-observation feasibility note and scientific compatibility policy v1 with measurable tolerances.

Exit: at least one real usable pair is demonstrated. A zero-result query or a synthetic pair alone does not satisfy this milestone.
If no compatible pair exists, adjust the target/epochs or documented demo approach before building the entire ML pipeline.

## 2. Observation discovery vertical slice (`observations`)

- [ ] Implement IRSA SIA2 adapter with bounded query, timeout/backoff, status/error/overflow handling and parsed metadata.
- [ ] Add TAP adapter only if required by the chosen product/metadata coverage; avoid speculative integrations.
- [ ] Create internal observation IDs and immutable source product/release identity mapping.
- [ ] Enrich schema with footprint, start/end times, units/time scales, wavelength context and snapshot provenance.
- [ ] Upsert normalized metadata; ensure repeat queries do not duplicate products or overwrite a different release.
- [ ] Implement paginated `POST /observations/search` and `GET /observations/{id}` responses.
- [ ] Cache repeat queries with a documented TTL; distinguish empty results from upstream failures.
- [ ] Expose only safe product metadata, not storage credentials or arbitrary URL-fetch capability.
- [ ] Test real fixtures, reordered/absent columns, invalid coordinates/dates, no results, timeouts and schema changes.

Exit: frontend owner can search and display trustworthy observation summaries with dates and source links.

## 3. Compatibility checks (`comparisons`)

- [ ] Implement versioned report checks for sky overlap, valid/distinct epochs, known time scales and source precision.
- [ ] Evaluate local wavelength/bandwidth overlap, release/calibration compatibility, pixel scale and PSF availability.
- [ ] Define and measure usable coverage, time-separation, wavelength and alignment tolerances.
- [ ] Keep each check's evidence/units and blocking/warning reasons machine-readable.
- [ ] Expose `POST /comparisons/validate` using server-known observation IDs and target region.
- [ ] Revalidate inside analysis execution using actual cutout metadata; metadata search alone is insufficient.
- [ ] Test incompatible wavelength, disjoint footprint, duplicated epoch, unsupported release and missing metadata.

Exit: incompatible pairs fail with actionable reasons before expensive work; no result claims improved time precision.

## 4. Durable analysis jobs (`analyses`, `pipeline`)

- [ ] Implement protected `POST /analyses`: validate IDs/config, idempotency key and request hash; transactionally enqueue.
- [ ] Add caller-scoped key uniqueness before multiple clients, worker heartbeat/attempt/deadline fields and migrations.
- [ ] Implement `GET /analyses/{id}` and cancellation with consistent states and stage-progress metadata.
- [ ] Build dedicated worker entrypoint with atomic PostgreSQL claims, short transactions, lease renewal and recovery.
- [ ] Define bounded retries, terminal scientific errors and cancellation checkpoints.
- [ ] Enforce job count, bytes, concurrency and wall-time quotas before accepting public/remote work.
- [ ] Register real stage executors behind explicit interfaces. Keep unavailable rankers/modes disabled.
- [ ] Add worker Compose service only when it can execute the accepted pipeline.
- [ ] Test duplicate requests, mismatched idempotency body, two-worker competition, crashes, expired leases and cancellation.

Exit: an accepted job survives API/worker restart and completes or fails deterministically; no silently abandoned queue entries.

## 5. Cutout acquisition and artifact storage (`cutouts`, `artifacts`)

- [ ] Implement trusted IRSA URL resolution and bounded cutout requests from persisted metadata.
- [ ] Validate allowed scheme/host/path and redirects; reject arbitrary user URLs/private-network destinations.
- [ ] Stream downloads to temporary keys with size/time limits; check decoded dimensions before allocation.
- [ ] Verify FITS structure/checksum where supported; record raw SHA-256 and source response metadata.
- [ ] Build local storage adapter and immutable keys/cache lookup based on product, region, release and parameters.
- [ ] Define production object-storage adapter and short-lived artifact delivery; keep secrets server-side.
- [ ] Add cleanup of abandoned temporary files and bounded failed-run retention.
- [ ] Test truncated files, invalid FITS, oversized/compressed inputs, interrupted downloads, redirects and cache reuse.

Exit: one verified pair is downloaded once, reproducibly retrieved and never exposed through arbitrary filesystem paths.

## 6. FITS inspection and preprocessing (`preprocessing`)

- [ ] Extract science, variance, quality flags, wavelength and WCS with explicitly selected HDUs/units.
- [ ] Apply reviewed bad-pixel/NaN/saturation/edge masks; never turn masked values into numerical zero detections.
- [ ] Keep source pixel-origin conventions and celestial transforms tested.
- [ ] Estimate background robustly and document zodiacal/background treatment.
- [ ] Retain source calibration/ePSF references and local wavelength coverage for each cutout.
- [ ] Create a compact QC report: usable pixels, coverage, flags, variance, dynamic range and missing inputs.
- [ ] Generate synthetic tests for stationary sources, movers, variable brightness and detector artifacts.

Exit: arrays, masks and metadata are internally consistent, unit-aware and suitable for the chosen comparison policy.

## 7. Registration and PSF/background matching (`registration`, `preprocessing`)

- [ ] Choose reference/common celestial grid and reproject using WCS; do not resize images without preserving science geometry.
- [ ] Propagate coverage/masks and account for interpolation effects on uncertainty.
- [ ] Measure residual alignment with suitable stationary sources; reject insufficient reference support or poor fits.
- [ ] Match background/photometric response within the validated wavelength policy.
- [ ] Obtain appropriate local PSF/ePSF and implement a documented matching method with a conservative target PSF.
- [ ] Record kernel/transform versions, residuals, correlation assumptions and QC pass/fail thresholds.
- [ ] Test offsets, rotations, pixel scale changes, blurred stars, wavelength mismatch, edges and sparse fields.

Exit: stationary control sources produce acceptable residuals under measured QC limits; bad registration cannot advance.

## 8. Difference imaging (`differencing`)

- [ ] Define science-minus-reference sign convention and reproducible difference calculation.
- [ ] Generate common validity mask, propagated variance/significance and coverage maps.
- [ ] Document limitations of significance after resampling/convolution; avoid pretending pixels are independent.
- [ ] Reject invalid uncertainties and insufficient overlap; record QC metrics.
- [ ] Save difference/mask/variance artifacts and browser preview stretch metadata.
- [ ] Test a stationary pair, injected shift, brightness-only change, cosmic-ray-like event and masked edge.

Exit: controlled examples produce expected signed patterns; zero candidates is a valid result, and a residual alone is not labeled motion.

## 9. Detection and association (`detection`, `association`, `candidates`)

- [ ] Detect sources independently per epoch and positive/negative residual components.
- [ ] Compute centroids, uncertainties, SNR, morphology, local flag/edge context and astrometric positions.
- [ ] Match stationary sources and associate possible shifted detections using uncertainty-aware distances/time separation.
- [ ] Separate possible_motion, brightness_change, artifact and uncertain; preserve alternatives/ambiguous matches.
- [ ] Require motion evidence to exceed measured registration/centroid uncertainty under the reviewed policy.
- [ ] Persist per-epoch evidence and candidate JSON schema; add indexed scientific columns when query needs are clear.
- [ ] Implement paginated candidate retrieval and detail endpoints only for published completed runs.
- [ ] Test blends, disappearing/appearing sources, stationary variables, near-threshold shifts and many-to-one associations.

Exit: frontend receives evidence-backed candidate hypotheses, with no confirmed-discovery claims from only two images.

## 10. Classical ranking baseline (`ranking`)

- [ ] Define transparent baseline features: SNR, registration quality, mask proximity, morphology and association residual.
- [ ] Implement a deterministic ranker against `CandidateRanker`; version config/thresholds.
- [ ] Label outputs as candidate_score and include explanation codes; do not imply probability calibration.
- [ ] Evaluate on controls and injection/recovery cases; report precision/recall where labels exist and artifacts per field.
- [ ] Publish the model/baseline card and failure modes.

Exit: the complete two-epoch pipeline can rank candidates reproducibly before adding a trained network.

## 11. Integrate the researcher's completed model (`ranking`)

Model development/training/evaluation/calibration are the ML researcher's deliverables, not backend tasks.
Use [the handoff checklist](docs/model_handoff.md) before implementing the serving adapter.

- [ ] Agree the exact input/output boundary: raw images, aligned pair, difference stamps, features or full pipeline.
- [ ] Receive versioned weights/export, architecture/loading code if required, and a runnable inference example.
- [ ] Receive exact preprocessing/postprocessing, dependencies, tensor shapes/dtypes/channel order and score/class meanings.
- [ ] Receive representative golden inputs, expected outputs and agreed numeric tolerances from the researcher.
- [ ] Receive the model card, held-out evaluation/calibration evidence, weights checksum and permitted-use information.
- [ ] Verify CPU/GPU, memory, batch size and latency requirements against the intended worker hardware.
- [ ] Implement an adapter around the supplied predictor; map its outputs to the backend candidate/evidence contract.
- [ ] Reproduce golden outputs locally and in Docker; resolve mismatches with the researcher instead of changing preprocessing silently.
- [ ] Load the approved model once per worker; enforce inference limits and test missing/corrupt weights and inference failures.
- [ ] Register immutable model/preprocessing versions and preserve them in results; expose enabled methods explicitly.
- [ ] Use probability labels only when the supplied calibration evidence supports them; otherwise expose candidate_score.
- [ ] Complete a backend end-to-end run using real compatible inputs and the delivered model.

Exit: the backend reproduces the researcher's reference inference within agreed tolerance, reliably serves
the pinned package and reports its supplied score semantics and limitations. Training and accuracy claims
remain the researcher's responsibility; backend acceptance verifies integration, not a new training run.

## 12. Multi-observation association / tentative tracking (`association`)

- [ ] Add sequence execution for >=3 compatible epochs with per-epoch detections and uncertainty.
- [ ] Fit/test a conservative angular-motion association model over the selected time baseline.
- [ ] Handle missing detections, outliers, ambiguous associations and any validity limits of the motion model.
- [ ] Report tentative track support, residuals and timestamps; separate this from orbital determination.
- [ ] Test planted tracks, crossing tracks, variables/artifacts and gaps; benchmark runtime/combinatorics.

Exit: sequence evidence supports tentative consistent motion without declaring a new object or planet.

## 13. Evidence delivery and frontend handoff (`artifacts`, `candidates`)

- [ ] Produce original/aligned/difference PNGs and candidate stamps while retaining full precision FITS separately.
- [ ] Supply WCS or tested pixel/sky overlay transforms, common grid, orientation and pixel-origin metadata.
- [ ] Expose date/time scale, wavelength, units, quality warnings, score kind and source links in one result manifest.
- [ ] Implement artifact-ID download/preview endpoints or scoped signed URLs and appropriate cache headers.
- [ ] Provide a curated successful pair, zero-candidate pair and failed-QC example for frontend integration.
- [ ] Export OpenAPI, stable sample JSON and error codes; test BFF/proxy authorization and allowed CORS origins.
- [ ] Coordinate viewer acceptance: blink/slider/side-by-side, overlays and accessible evidence list are frontend-owned.

Exit: a frontend teammate can implement comparison without scientific processing or undocumented backend assumptions.

## 14. Reliability, security and performance

- [ ] Add request IDs, structured sanitized logs, metrics, stage timings and worker/queue health.
- [ ] Test database outage, unavailable IRSA, file corruption, worker crash, cancellation and storage failure.
- [ ] Enforce read/write permissions, server-side submission credentials, quotas and safe artifact access.
- [ ] Measure cache-cold/warm latency, peak memory, CPU, download size and job concurrency on target hardware.
- [ ] Add PostgreSQL job/storage integration tests and end-to-end synthetic-pair tests in CI.
- [ ] Validate schema migrations against a disposable PostgreSQL database, including drift and recovery.
- [ ] Lock dependencies and scan production image/model artifacts for known issues and leaked credentials.

Exit: measured resource budgets pass and unsupported science fails explicitly rather than generating misleading output.

## 15. Hugging Face backend deployment and release

- [ ] Build/test root API image as UID 1000 on port 7860; verify CORS and OpenAPI from the frontend origin.
- [ ] Provision external PostgreSQL and durable artifact/model object storage with TLS and backups.
- [ ] Run migrations once per release; validate database/object-store restore consistency.
- [ ] Choose worker topology: separate durable worker preferred; co-located supervised worker only after sleep/recovery testing.
- [ ] Configure secrets/runtime variables and health/worker/queue monitoring; never store credentials in React bundles.
- [ ] Test Space restart/sleep, lease recovery, artifact persistence and model load/resource availability.
- [ ] Assemble curated demo evidence and a clearly identified cached fallback for upstream outages.
- [ ] Confirm complete official brief, submission fields, deadline/timezone and permitted existing-work rules.
- [ ] Freeze tested backend release, hand off API examples/model card and submit supporting material with the team.
- [ ] Commit/push to main only when explicitly requested by the user, using anindya357.

## Release order

| Release | Required milestones | Proof |
| --- | --- | --- |
| Foundation | 0 | Honest runnable API/schema/contracts |
| Data feasibility | 1–3 | Real compatible observations with reproducible provenance |
| Scientific baseline MVP | 4–10 and 13 | Durable two-epoch job with classical candidates/evidence |
| Cosmic Motion AI release | 11 plus baseline | Evaluated CNN/Siamese ranker integrated behind the same API |
| Sequence extension | 12 | Tentative multi-epoch motion with uncertainty |
| Hosted demonstration | 14–15 | Stable public evidence APIs and protected processing backend |

Do not let model training hide a broken image-comparison pipeline. The AI release requires actual
evaluation, while the baseline remains useful and explicitly labeled on its own.
