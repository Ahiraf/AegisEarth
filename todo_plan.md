# Cosmic Motion AI — challenge-first backend delivery plan

Baseline: **29 October 2026**, revised against the full challenge description supplied by the user.
Required workflow: **RA/Dec → same sky patch → chronological SPHEREx images → play/blink/scrub**.
The viewer works independently of an ML model. All potential considerations are included in the
expanded release at the user's request; checked planning work does not imply implemented features.

Your scope: feature-based FastAPI/Python backend, PostgreSQL, image processing, Docker and Hugging Face.
The React owner implements playback/UI/Aladin integration. The ML researcher owns training/evaluation;
you integrate the supplied inference package later. No commit/push without explicit instruction.

## Baseline and definition of done

- [x] Map the supplied objective, five required targets and every consideration into this plan and SRS.
- [x] Preserve the existing foundation and real-data research; revise backend/pipeline/API/data planning.
- [x] Review independent public IRSA, CDS/Aladin, Astropy, Gaia/WISE and hosting references.
- [ ] Verify full organizer submission rules, deadline/timezone and eventual resource updates separately.

Existing: health/config, strict request scaffolds, initial seven-table migration plus additive processing-job
migration/RPCs, curated GET /targets, disabled eleven-stage registry, QR2/QR3 inspection and engineering
compatibility helpers. Live discovery and durable input acquisition/worker are implemented in steps 2–3;
view-v2 frame preparation is implemented in step 4. Step 5 movie delivery and an isolated React/Aladin handoff are locally verified; production frontend acceptance and coadds/spectra/overlays remain pending. The old 2–6 observation analysis request is not a viewer API.
The 26 October M101 QR2 proof (36.394305-day repeat, 353/400 usable common pixels) remains a useful
control. It does not validate the five challenge targets, QR3, photometry or moving-source detection.

For every feature: requirement IDs → schema/migration → repository/provider → service/pure processing
→ route/worker → meaningful controls/failure tests → OpenAPI/examples → frontend handoff → measured
real-data acceptance. Preserve source IDs, units, epochs/time scales, flags, calibration/response,
transforms/config versions and checksums. Migrate existing schema/contracts without resetting data.

## 0. Foundation and production persistence (`core`, `health`)

- [x] Verify Docker/PostgreSQL migrations, drift and recovery using a disposable DB; lock dependencies.
- [ ] Prototype Hugging Face Space → PostgreSQL access early. HF documents outbound ports 80/443/8080;
      ordinary PostgreSQL 5432 is not an assumed reachable route.
- [x] Select/test allowed PostgreSQL transport or an authenticated HTTPS repository gateway such as
      PostgREST with transactional SQL functions. PostgreSQL remains the database.
- [x] For a gateway, add a separate repository/readiness adapter and atomic job RPCs; native DB workers
      and Alembic run where PostgreSQL is reachable. An HTTPS gateway is not a psycopg connection URL.
- [x] Record worker/object-storage topology, capacity and cost limits before enabling public processing.

29 October clarification: the user requested **local preparation/testing** because cloud resources are
not set up. That local scope is complete: [foundation guide](docs/foundation.md) and
[eleven-check local proof](docs/verification/foundation_report.json). The actual HF connectivity checkbox
above is deliberately left open for deployment; a local TLS test is not claimed as a Space test.

Exit: working local foundation plus a demonstrated cloud persistence route; no hosting success presumed.

## 1. Prove the five-target data path (`targets`, `observations`, `releases`)

- [x] Retain pinned M101 repeat, wavelength-negative control, hashes, report and executed research notebook.
- [x] Create the five records in [target validation](docs/target_validation.md), including source receipts.
- [x] Resolve aliases/coordinates through CDS/SIMBAD; distinguish system Epsilon Indi B from Indi A, with Ba/Bb resolution explicitly unclaimed.
- [x] Preserve reference epoch/frame, proper motion, errors and bibliographic source. WISE 0855's supplied
      position has no epoch in the brief; preserve that uncertainty instead of assigning one.
- [x] Query QR3 wide/deep and QR2 wide/deep as applicable; record status/overflow, query/retrieval UTC,
      source IDs, calibration, actual dates and spectral coverage. Empty single-field results are local evidence only.
- [x] Prefer consistent QR3/ePSF sequences; retain labeled QR2 fallback. Inspect small FITS cutouts for
      science, variance, flags, WCS-WAVE and release-specific PSF/ePSF formats.
- [x] Produce per-target coverage/FOV/SNR-proxy/flag/epoch/wavelength/motion-versus-resolution reports.
- [x] Pin public manifests/hashes/attribution; keep large FITS outside Git and DB.

Evidence: [five-target packet](docs/research/target_feasibility/README.md), 20 successful bounded queries,
27 hash-pinned native cutouts and all five inspected fields. This is source feasibility, not phase-6
public-viewer/scientific acceptance. Short baselines, flags and response/common-coverage mismatches
remain explicit; no measured motion, variability or calibrated detection is claimed.

Exit: real evidence for all five targets and usable movie fixtures where available. M101/3I/ATLAS do not
replace these tests. Missing coverage or signal is investigated/reported, never fabricated into a detection.

## 2. Coordinates, releases and observation discovery (`targets`, `releases`, `observations`)

- [x] Parse decimal-degree and sexagesimal RA/Dec with explicit units and ICRS normalization; test RA
      wrap/poles/negative declination/invalid inputs. Decimal RA means degrees; sexagesimal RA means hours.
- [x] Accept FOV/date/band/release choices; allow first-use discovery of available dates.
- [x] Introduce a versioned QR3/QR2 wide/deep source registry with adapters for future release formats.
- [x] Implement bounded SIA with INFO-status, column-name, timeout/backoff and overflow handling.
      Add TAP/DataLink only where necessary for complete bounds, valid links or fresh ingestion.
- [x] Search the full rectangular FOV including corners; disclose partial/truncated results and gaps.
- [x] Persist immutable products/snapshots and deduplicate the same exposure across reprocessed releases.
- [x] Return epochs, detector/image-wide wavelength bounds, safe links and deterministic pagination;
      local wavelength remains explicitly unknown until step-4 FITS WCS-WAVE inspection.
- [x] Add TTL/revalidation metadata and tests for outages, empty results, schema changes and duplicate products.

Evidence: [discovery implementation](docs/discovery.md), [live five-target/API/gateway proof](docs/verification/discovery_report.json),
additive cosmic_0003, immutable product/snapshot repositories, 15-minute revalidation and frozen pages.
SIA is sufficient for bounded discovery with explicit overflow; complete bulk/fresh ingestion via
TAP/DataLink remains step 10 when needed. Spectral bounds here are whole-image metadata; local
WCS-WAVE response/quality remains step 4. This does not claim complete survey coverage.

Exit: a bounded coordinate/FOV search exposes actual sampled SPHEREx epochs and detector-wide
spectral bounds to React, with completeness/quality limits made explicit.

## 3. Public viewer requests, durable jobs and files (`views`, `analyses`, `cutouts`, `artifacts`)

- [x] Add viewer-specific request/schema/migrations; no ranking_method, model or preselected observation
      IDs required for coordinate-driven playback. Preserve/deprecate old analysis contracts explicitly.
- [x] Implement anonymous bounded viewing jobs with server-enforced quotas, cache reuse and global queue limits;
      admin refresh/bulk routes use server-side auth. No accounts/shared React secret prerequisite.
- [x] Persist accepted requests/idempotency, worker atomic claims/leases/heartbeat/deadlines/retries and cancellation.
      Scope cancel permission to an opaque job capability; keep tokens out of public share URLs.
- [x] Resolve trusted archive/DataLink URLs, stream atomic bounded downloads and verify hashes/FITS structure.
- [x] Enforce per-source/total bytes, decoded dimensions, frame count, CPU/memory/time and worker concurrency.
- [x] Implement local/external object storage, opaque artifact IDs, immutable cache keys and bounded cleanup.
- [x] Test truncated downloads, invalid FITS, two-worker claims, changed sources and crash/restart/cancel recovery.

Evidence: [input acquisition guide](docs/views.md), [live API/worker/FITS proof](docs/verification/views_report.json),
[authenticated TLS view persistence](docs/verification/views_gateway_report.json), additive cosmic_0004
and concurrency/fencing/corruption/retention controls. Admin/bulk HTTP routes are not exposed;
operator cleanup requires native database/storage credentials. External S3 SDK contracts are tested
locally; real cloud-provider provisioning/connectivity remains deployment work, as requested.

Exit: public coordinate work is durable and resource bounded, without requiring model access or user accounts.
Legacy view-v1 success remains inputs_ready. Steps 4–5 now provide view-v2 prepared frames and a separate movie readiness outcome; legacy jobs are preserved.

## 4. Band selection and comparable frames (`bands`, `comparisons`, `preprocessing`, `registration`)

- [x] Read QR2 PSF and QR3 ePSF through explicit release-aware readers, retaining original metadata.
- [x] Apply reviewed flag/NaN/positive-variance masks; SOURCE/FULLSAMPLE are not blindly discarded.
- [x] Expose 102 nominal-channel metadata and actual per-region/epoch wavelength/response availability.
      Missing bands remain unavailable, not invented samples.
- [x] Default motion playback to common supported wavelength coverage; support detector/channel selection
      with visible date/band/coverage context. Same detector alone is not comparability evidence.
- [x] Separate display eligibility from subtraction/photometry gates. Flagged native previews may be
      inspected while strict quantitative operations are blocked with reasons.
- [x] Build bounded temporal bins with all contributor times/counts; do not blur distinct epochs into one frame.
- [x] Reproject science/masks/variance onto a fixed sky grid, FOV and orientation; measure registration
      residuals independently of the moving target and flag inadequate reference support.
- [x] Acquire padded input cutouts for rotation/PSF kernels so common output coverage preserves the
      requested FOV; step-1 native crops showed conservative overlap losses. Do not silently crop output.
- [x] Create native/common-grid previews with shared default stretch across comparable epochs and masked
      transparency. Per-frame stretch is a labeled alternative; original values remain retrievable.
- [x] Keep default frames sky-fixed; target tracking/recentering is a separate explicitly labeled mode.

Evidence: [frame-preparation contract](docs/frame_preparation.md), [five-target sample processing](docs/verification/frame_preparation_report.json),
[live view-v2 job and HTTPS parity](docs/verification/prepared_view_report.json), official R7 102-channel
CSV/response capture and additive cosmic_0005. Nominal fiducials, WCS-WAVE visualization proxies
and quantitative pixel responses remain distinct. Pipeline CWAVE/CBAND, full response/PSF matching
and calibrated photometry are not claimed; quantitative operations remain blocked with reasons.
Old unpadded target samples do not all form comparable sequences; those failures remain visible.

Exit: scientifically interpretable geometry and spectral context, without silently hiding motion/variability.
Prepared artifacts/report are implemented; step 5 below now adds locally verified movie delivery.

## 5. Movie manifests and public React handoff (`views`, `artifacts`, frontend owner)

- [x] Implement view status/manifest/frame routes with stable chronological order, UTC labels, actual time
      gaps, band/units, WCS/grid/stretch, quality warnings, coverage, source links and artifact references.
- [x] Distinguish no_data, single_epoch and ready_for_animation; no looping one frame as apparent motion.
- [x] Serve small cached previews first, preload subsequent frames and paginate timelines; video encoding
      is optional export, not the normal playback path. Respect download concurrency and retry bounds.
- [x] Deliver an isolated React reference for play/pause/loop/speed/scrub/step, blink and side-by-side.
      Show physical time separately; include keyboard/reduced-motion/text metadata support.
- [x] Provide a working Aladin Lite 3.8.1 spike: real primary-2D FITS, catalog marker, sky/pixel mapping,
      CORS and widget-failure isolation. Production frontend files remain untouched.
- [x] Verify local coordinate submission → backend → React → real chronological animation without ML.
- [ ] Frontend owner ports/accepts the handoff in the production UI; verify the real public deployment
      once cloud resources are provisioned. These are external integration/deployment gates.

Backend/local handoff complete, 1 November 2026: [movie contract](docs/movie_delivery.md),
[real API/HTTPS/empty/single proof](docs/verification/movie_delivery_report.json),
[React/Aladin proof](docs/verification/movie_player_report.json). Additive cosmic_0006 freezes manifests.
The real three-epoch QR3 D5 sequence is quality-limited browsing with comparison_supported=false;
no scientific motion/variability claim is made. Empty/single worker jobs were also exercised.

Exit: the local anonymous coordinate-to-movie workflow and handoff work with truthful labels.
Public frontend integration/deployment acceptance remains explicit above; five-target science is step 6.

## 6. Required target validation (`targets`, `views`, frontend owner)

- [ ] Execute every row in [the five-target matrix](docs/target_validation.md) and record exact source evidence.
- [ ] Barnard's Star: compare measured/expected displacement to resolution and registration uncertainty.
- [ ] Epsilon Indi B: verify brown-dwarf system identity; do not require unresolved components to be separately seen.
- [ ] WISE 0855: test supplied coordinate, unknown epoch/proper motion and actual long-wavelength signal;
      record defensible nondetection/coverage limits rather than demand a visible moving point.
- [ ] RW Aurigae and R Draconis: preserve brightness differences with shared stretch, inspect saturation,
      wavelength/calibration confounds and avoid interpreting all change as displacement.
- [ ] Keep target query/epoch/band/frame/warning/reviewer evidence and re-run after release/processing changes.

Exit: all five prescribed targets actually tested. Claims about visible change require positive evidence;
coverage/sensitivity limitations remain explicit, not relabeled as successful discoveries.

## 7. Six detector composites, add and subtract (`bands`, `coadds`, `differencing`)

- [ ] Offer D1–D6 per-epoch composites with fixed documented wavelength support/weighting and contributor maps.
- [ ] Implement variance-aware weighted means for calibrated intensity, or clearly labeled weighted sums;
      retain count/coverage/effective-response/uncertainty maps and invalid-pixel masks.
- [ ] Add across selected epochs as a distinct product; retain the original movie and warn that long
      sky-fixed stacks smear movers and dilute variability. Do not coadd changing spectral coverage silently.
- [ ] Gate signed later-minus-earlier differences on wavelength, registration, background, calibration and
      PSF/ePSF support. Return reasons for ineligible pairs while allowing original-image inspection.
- [ ] Export coadd/difference/mask/variance previews and FITS with units and lineage.
- [ ] Test analytic flux/variance, static fields, injected shifts, variables, PSF/response changes and masks.

Exit: all six detector options and image addition/subtraction work on eligible inputs, with honest failures.

## 8. On-demand spectra and brightness evidence (`spectra`)

- [ ] Add a clicked-coordinate/aperture spectrum job scoped to selected epoch groups, with wavelength,
      calibrated flux-density unit, errors, bandwidth/response, quality flags and contributors.
- [ ] Check official SPHEREx spectrophotometry tooling first; use a documented callable interface if suitable,
      otherwise a reviewed local photometry/ePSF method. A GUI link is not a verified API.
- [ ] Validate background, PSF/aperture correction, pixel solid angle and calibration; MJy/sr pixels are not
      integrated source flux. Flag blends, extended sources, saturation and missing channels.
- [ ] Keep variable-source epochs separate and use explicit per-epoch positions for moving-source extraction.
- [ ] Return only available samples/defensible upper limits; never interpolate missing channels into a fake 102-point spectrum.
- [ ] Provide plot-ready JSON/CSV and per-epoch brightness comparisons; test against appropriate reference extractions.

Exit: on-demand spectra are usable and inspectable, with method/coverage/uncertainty limits.

## 9. Gaia and WISE overlays (`overlays`)

- [ ] Implement bounded Gaia DR3 TAP queries and WISE catalog/image discovery using current IRSA schemas.
- [ ] Retain survey epoch/time span, band, coordinate frame, errors, flags, IDs and attribution.
- [ ] Propagate positions only with known reference epoch/proper motion and correct pmRA*cos(dec) convention;
      label missing astrometry/parallax/apparent-position limits. Predictions are not SPHEREx detections.
- [ ] Serve Gaia markers and WISE W1/W2 image/catalog context in a tested common sky/pixel mapping;
      React supplies toggles/opacity/legends, optionally through Aladin.
- [ ] Label deep coadds by time span; do not substitute WISE for missing SPHEREx movie frames or compare
      unlike surveys quantitatively without separate validation.
- [ ] Test high-proper-motion mismatches, empty layers, PSF differences, provider outages and CORS.

Exit: both Gaia and WISE context are usable; overlay failure does not break core SPHEREx playback.

## 10. Latest releases, coordinate URLs, embedding and exports (`releases`, `views`, `artifacts`)

- [ ] Add bounded scheduled/admin refresh, configurable TTL, last-checked time and source registry version;
      account for IRSA ingestion/SIA lag and new release schema/PSF/calibration validation.
- [ ] Freeze published view manifests; rebuild explicitly for latest data and deduplicate reprocessed exposures.
- [ ] Define versioned frontend query URLs (RA/Dec/FOV/dates/band/mode) plus immutable view-ID links;
      backend returns canonical normalized state. Reopening restores choices within resource quotas.
- [ ] Coordinate an embeddable route/iframe policy, validated URL parameters, framing/CORS and accessibility
      with React. Test both coordinate links and actual embedding in a second site.
- [ ] Export metadata/spectrum JSON/CSV and derived FITS; add bounded asynchronous GIF/MP4 export with
      date/band/quality captions and provenance sidecar if useful to submission.
- [ ] Verify refresh discovers new eligible data without changing frozen links; share/restore/export preserve credits.

Exit: every potential consideration has implementation and acceptance evidence, not just planning coverage.

## 11. Reliability, Hugging Face and expanded release (`health`, deployment)

- [ ] Measure cold/warm latency, memory, bytes and concurrency for all targets and larger FOVs; expose cost/limit
      feedback before heavy work. Proposed SRS limits are configurable budgets, not benchmark guarantees.
- [ ] Test selected DB transport's transaction/lease semantics, migrations, backups and object-store restore.
- [ ] Build API Docker image on 7860/UID 1000, validate TLS/CORS/artifact caching and dependency versions.
- [ ] Provision external PostgreSQL/object storage and durable CPU worker; prove Space sleep/restart recovery.
      A sleeping Space is not the scheduler/worker for continuous refresh. Keep all private credentials server-side.
- [ ] Test provider/queue/storage failures, cancellation and corruption; publish dated cached target fallbacks.
- [ ] Complete frontend/device/keyboard/reduced-motion/embedding acceptance and all coverage-matrix rows.
- [ ] Assemble reproducible five-target demo, credits and final organizer submission/rule checks.
- [ ] Commit/push/deploy only when explicitly authorized; main/anindya357, no force-push or frontend overwrite.

Exit: expanded release includes the working public viewer, all considerations and actual five-target tests.

## 12. Optional researcher model integration (`detection`, `association`, `ranking`, `candidates`)

This is outside core/expanded challenge release gates. Keep existing disabled interfaces; remove mandatory
backend-built classical ranking and automatic track fitting from the critical path.

- [ ] Receive the package, exact I/O/transforms, weights hash/license, dependencies, goldens/tolerances,
      model card and evaluation/calibration evidence via [model handoff](docs/model_handoff.md).
- [ ] Integrate the supplied predictor/stages without rebuilding or training its model; verify parity locally/in Docker.
- [ ] Run optional suggestion jobs on approved inputs and serve stamps/score meaning/uncertainty/failure modes.
- [ ] Isolate inference failure; time browsing, movies, spectra and context remain usable without the model.

Deferred/excluded: automatic orbital/track solutions, confirmed Planet X/discovery claims, full-sky scanning,
social annotation/accounts, unrestricted uploads, impact-risk/geographic features and mandatory classical ranking.

## Release order

| Release | Milestones | Proof |
| --- | --- | --- |
| Existing foundation/research | Prior evidence preserved | Scaffold + M101 engineering controls; not a viewer |
| Core challenge viewer | 0–6 | Public RA/Dec/FOV → real movie + five-target test report |
| Expanded challenge release | 0–11 | All [coverage matrix](docs/challenge_alignment.md) rows accepted |
| AI-assisted enhancement | 12 after validated inputs | Supplied inference parity and truthful suggestion evidence |

Contracts: [SRS](SRS.md), [pipeline](docs/backend_pipeline.md), [API](docs/api_contract.md),
[data model](docs/data_model.md), [validation](docs/science_ml_validation.md),
[resources](docs/sources_and_challenge.md), [deployment](docs/deployment.md).
