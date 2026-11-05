# AegisEarth — challenge-first backend delivery plan

Baseline: **29 October 2026**, revised against the full challenge description supplied by the user.
Required workflow: **RA/Dec → same sky patch → chronological SPHEREx images → play/blink/scrub**.
The viewer works independently of an ML model. All potential considerations are included in the
expanded release at the user's request; checked planning work does not imply implemented features.

Your scope: feature-based FastAPI/Python backend, PostgreSQL, image processing, Docker and Hugging Face.
The React owner's design is preserved; the user additionally requested production frontend integration
with completed backend features on 5 November 2026. The ML researcher owns training/evaluation;
you integrate the supplied inference package later. No commit/push without explicit instruction.

## Baseline and definition of done

- [x] Map the supplied objective, five required targets and every consideration into this plan and SRS.
- [x] Preserve the existing foundation and real-data research; revise backend/pipeline/API/data planning.
- [x] Review independent public IRSA, CDS/Aladin, Astropy, Gaia/WISE and hosting references.
- [ ] Verify full organizer submission rules, deadline/timezone and eventual resource updates separately.

Existing: health/config, strict request scaffolds, initial seven-table migration plus additive processing-job
migration/RPCs, curated GET /targets, disabled eleven-stage registry, QR2/QR3 inspection and engineering
compatibility helpers. Live discovery and durable input acquisition/worker are implemented in steps 2–3;
view-v2 frame preparation is implemented in step 4. Steps 5–10 movie delivery, target investigations,
derived diagnostic jobs, overlays, refresh/sharing/export and production React controls are implemented.
Scientific acceptance and public deployment remain pending; see the dated frontend verification limits below.
The old 2–6 observation analysis request is not a viewer API.
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
- [x] Frontend owner accepts the handoff in the production UI — user-confirmed 1 November 2026.
      This acceptance is recorded from the user, not independently inferred from local browser tests.
- [ ] Verify the actual public deployment after cloud resources are provisioned.

Backend/local handoff complete, 1 November 2026: [movie contract](docs/movie_delivery.md),
[real API/HTTPS/empty/single proof](docs/verification/movie_delivery_report.json),
[React/Aladin proof](docs/verification/movie_player_report.json). Additive cosmic_0006 freezes manifests.
The real three-epoch QR3 D5 sequence is quality-limited browsing with comparison_supported=false;
no scientific motion/variability claim is made. Empty/single worker jobs were also exercised.

Exit: the local anonymous coordinate-to-movie workflow and handoff work with truthful labels.
Frontend-owner handoff acceptance is user-confirmed; public deployment remains open; five-target science is step 6.

## 6. Required target validation (`targets`, `views`, frontend owner)

- [x] Execute every row in [the five-target matrix](docs/target_validation.md) and record exact source evidence.
- [x] Barnard's Star: compare measured/expected displacement to resolution and registration uncertainty.
- [x] Epsilon Indi B: verify brown-dwarf system identity; do not require unresolved components to be separately seen.
- [x] WISE 0855: test supplied coordinate, unknown epoch/proper motion and actual long-wavelength signal;
      record defensible nondetection/coverage limits rather than demand a visible moving point.
- [x] RW Aurigae and R Draconis: preserve brightness differences with shared stretch, inspect saturation,
      wavelength/calibration confounds and avoid interpreting all change as displacement.
- [x] Keep target query/epoch/band/frame/warning/reviewer evidence and re-run after release/processing changes.

Engineering execution complete, 1 November 2026: [results and limitations](docs/verification/targets/README.md),
[aggregate receipt](docs/verification/targets/summary.json) and [local browser checks](docs/verification/targets/browser.json).
Scientific reviewer is recorded as unavailable; no scientific approval is fabricated. Public deployment remains a separate gate.

Exit: all five prescribed targets actually tested. Claims about visible change require positive evidence;
coverage/sensitivity limitations remain explicit, not relabeled as successful discoveries.

## 7. Six detector composites, add and subtract (`bands`, `coadds`, `differencing`)

- [x] Offer D1–D6 detector/epoch composites with fixed requested wavelength windows and per-input weight/support maps.
- [x] Implement inverse-variance intensity means and explicitly count-scaled weighted sums; export masks,
      variance, count, coverage, exposure, wavelength proxies and contributor maps/FITS lineage.
- [x] Make explicit temporal stacks distinct from the movie; reject changing local spectral/calibration
      support and preserve motion-smearing/variability warnings. Coadd epoch previews share one stretch.
- [x] Implement signed later-minus-earlier numerical subtraction and operation-specific response,
      registration, PSF/background/calibration/covariance gates. Unsupported real pairs return reasons.
- [x] Export FITS/PNG/JSON products and preserve verified raw/common-grid inputs under child retention.
- [x] Test analytic means/variance, shifts, variables, masks, PSF/response rejection, source integrity,
      shared quotas/idempotency, fenced cancellation and native/HTTPS publication.
- [ ] Enable science-grade real subtraction only after matched-response/PSF, independent registration,
      CWAVE/CBAND/background/photometry/covariance acceptance exists. Existing frames-v1 is not certified.

Backend delivery: [implementation/React contract](docs/derived_operations.md),
[executed derived-job evidence](docs/verification/derived_operations.json). All six options are offered;
source acquisition availability/failures are recorded separately rather than manufactured into success.
The signed numerical engine is verified on controlled eligible inputs; public real-data subtraction
correctly remains ineligible under the current preparation's scientific limits.

Exit: bounded combination/export workflows are implemented and tested; real science-grade difference
acceptance remains the explicit checkbox above. Display readiness is not calibration approval.

## 8. On-demand spectra and brightness evidence (`spectra`)

- [x] Add bounded clicked-coordinate/aperture jobs with explicit input epochs or per-epoch positions;
      return physical flux-density/error units, wavelength/width proxies, flags and source lineage.
- [x] Inspect official SPHEREx spectrophotometry guidance. No documented callable submission API was
      verified; implement/test a local point-source PSF-corrected aperture method in diagnostic mode.
- [x] Implement strict native masks, source-excluded background, spatial QR3 ePSF/guarded QR2 PSF,
      exact spherical pixel solid angles and aperture correction. MJy/sr sums are never called source flux.
- [x] Keep variable epochs separate, require complete supplied moving-source positions, flag potential
      blends/extended-source assumptions/saturation and preserve unavailable samples as null.
- [x] Return measured sparse samples only, no invented upper limits and no fake 102-channel interpolation.
- [x] Provide plot-ready JSON/CSV plus gated brightness-comparison metadata; verify flux conversion
      against an independent pixel-integrated Gaussian reference and real native-data outputs.
- [ ] Complete absolute calibration/response/covariance and deblended reference-extraction acceptance
      before promoting diagnostic samples to science-grade spectra or calibrated variability claims.

Backend delivery: [spectrum method and API](docs/derived_operations.md) and
[executed data/CSV evidence](docs/verification/derived_operations.json). Diagnostic fluxes are physical
unit conversions with explicit approximate errors, not externally validated research spectra.

Exit: on-demand extraction/export is usable and inspectable; the scientific acceptance gate above
remains honest. Model training and the researcher's inference package are not prerequisites.

## 9. Gaia and WISE overlays (`overlays`)

- [x] Implement bounded Gaia DR3 TAP queries and WISE catalog/image discovery using current IRSA schemas.
- [x] Retain survey epoch/time span, band, coordinate frame, errors, flags, IDs and attribution.
- [x] Propagate positions only with known reference epoch/proper motion and correct pmRA*cos(dec) convention;
      label missing astrometry/parallax/apparent-position limits. Predictions are not SPHEREx detections.
- [x] Serve Gaia markers and WISE W1/W2 image/catalog context in a tested common sky/pixel mapping;
      backend reference supplies toggles/opacity/legends; production React consumes the documented contract.
- [x] Label deep coadds by time span; do not substitute WISE for missing SPHEREx movie frames or compare
      unlike surveys quantitatively without separate validation.
- [x] Test high-proper-motion mismatches, empty layers, PSF differences, provider outages and CORS.

Backend/local exit: Gaia and WISE catalog/image context are usable; optional-layer failures do not
break SPHEREx playback. See [context/sharing contract](docs/context_sharing.md). Production React
integration of these new controls and actual public-host acceptance remain step 11.

## 10. Latest releases, coordinate URLs, embedding and exports (`releases`, `views`, `artifacts`)

- [x] Implement bounded admin refresh and an external-scheduler CLI, configurable TTL, last-checked time and source registry version;
      account for IRSA ingestion/SIA lag and new release schema/PSF/calibration validation.
- [x] Freeze published view manifests; rebuild explicitly for latest data and deduplicate reprocessed exposures.
- [x] Define versioned frontend query URLs (RA/Dec/FOV/dates/band/mode) plus immutable view-ID links;
      backend returns canonical normalized state. Reopening restores choices within resource quotas.
- [x] Deliver the embeddable route/iframe policy, validated URL parameters, framing/CORS and accessible
      reference handoff for React. Test coordinate restore and actual embedding in a second local site.
- [x] Export metadata/spectrum JSON/CSV and derived FITS; add bounded asynchronous GIF export with
      date/band/quality captions and provenance sidecar if useful to submission.
- [x] Verify refresh discovers new eligible data without changing frozen links; share/restore/export preserve credits.

Backend/local exit: refresh, state links, reference embedding and GIF/metadata exports have implementation
and verification evidence. [API/job evidence](docs/verification/context_sharing.json) and
[browser evidence](docs/verification/context_browser.json) distinguish real data from simulated failures.
The external scheduler is prepared, not provisioned; production React/public deployment remain step 11.
Unfinished step-7/8 scientific acceptance is not erased by completing these backend features.

## 11. Reliability, Hugging Face and expanded release (`health`, deployment)

Production frontend follow-up requested by the user — 5 November 2026:

- [x] Preserve the designer's palette/fonts/styles, hero, navigation and educational sections.
- [x] Connect live coordinate/FOV/date/release searches, all five presets and 102-channel/detector controls.
- [x] Connect frozen chronological playback, native/common modes, blink/side comparison and quality/source downloads.
- [x] Connect Gaia/WISE context, optional Aladin, coadds, gated subtraction, diagnostic spectra and GIF jobs.
- [x] Connect canonical coordinate restore, frozen links, reference iframe snippets, metadata export and explicit refresh.
- [x] Verify controlled API workflows on desktop/390px, keyboard/reduced motion, retries/cancellation,
      expired/empty/single-epoch results and optional-provider failure isolation; build production/Docker bundles.
- [x] Verify real API reference/session requests and full coordinate-state restore through local frontend proxy.
- [ ] Verify a fresh real-pixel frontend movie and successful Aladin load when the local API can reach IRSA SIA.

See [frontend setup and exact verification boundaries](docs/frontend_integration.md). This completes
the integration code; it does not mark the remaining expanded-release acceptance below complete.

- [x] Measure first/repeat local preparation, memory and bytes for all five targets at 3′ and 30′ with pinned inputs.
      Exercise two concurrent preparation processes and show the estimated grid and runtime limits before submission.
- [x] Verify local PostgreSQL and HTTPS gateway transactions, leases, migrations, database restart and logical backup.
      Restore the local file store and verify an object with its restored ledger record.
- [x] Build and run the API Docker image on 7860/UID 1000. Verify local TLS gateway, CORS, artifact caching and dependencies.
- [ ] Measure live and hosted archive download, queue latency, transfer size and throughput at representative and larger FOVs.
- [ ] Provision external PostgreSQL/object storage and durable CPU worker; prove Space sleep/restart recovery.
      A sleeping Space is not the scheduler/worker for continuous refresh. Keep all private credentials server-side.
- [ ] Restore hosted object storage and PostgreSQL together from provider backups and verify a published artifact.
- [x] Test provider/queue/storage failures, cancellation and corruption locally. Bundle five dated target contact sheets in the frontend.
- [x] Verify controlled desktop and narrow browser interaction, keyboard and reduced motion. Retain the local second-origin embed receipt.
- [x] Assemble a reproducible five-target demo, source credits and the published 2026 organizer submission window.
- [ ] Complete public-host, real-device and public embedding acceptance and close the remaining coverage-matrix science rows.
- [ ] Confirm the registered Local Event and its pitch/Project Tab requirements before organizer submission.
- [ ] Commit/push/deploy only when explicitly authorized; main/anindya357, no force-push or frontend overwrite.

The [Step 11 local report](docs/step11_release.md) contains the reproduction commands and evidence.
Expanded release exit requires the working public viewer, hosted recovery and the remaining acceptance above.

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
