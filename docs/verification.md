# Backend foundation and data-path verification

## Step 5 backend and local handoff implemented — 1 November 2026

- **128 backend tests passed** against disposable PostgreSQL 17, including additive cosmic_0006
  upgrade/drift/downgrade, source-bound first-writer manifest publication, expiry, pagination/chronology,
  UTC gaps, empty/single readiness, coordinate mapping and deterministic primary FITS. The existing
  Starlette/httpx deprecation warning remains; no broken Python requirements were found.
- [Real delivery proof](verification/movie_delivery_report.json): a bounded three-epoch QR3 D5 job,
  frozen SHA/ETag/304, stable one-frame pages, verified preview bytes, primary FITS units/WCS/CORS,
  PNG/sky coordinate round trip and native/authenticated HTTPS publication parity. Separate actual
  one-input and pre-mission empty worker jobs return single_epoch and no_data without looping.
- [React/Aladin proof](verification/movie_player_report.json): coordinate form → real backend images
  → animation without ML, controls/keyboard/reduced-motion text and optional Aladin 3.8.1 FITS/catalog
  loading with ICRS round-trip error below 1e-6 degrees. Forced widget failure preserves image stepping;
  simulated empty/single UI cases cannot animate. No unhandled browser errors on the successful run.
- The isolated handoff build passes; optional Aladin remains a separately loaded large chunk. CI now
  builds this handoff independently of the production frontend. Local checks do not claim a remote CI run.
- [Contract/reproduction](movie_delivery.md), OpenAPI, SRS v2.4, plan and implementation boundaries
  are updated. No production frontend files, existing remote history or source bytes were rewritten.

The real sample's comparison_supported=false is retained: this is quality-limited image browsing,
not scientific detection/photometry or confirmed visible target motion. Step 6 five-target science,
production frontend-owner integration, actual public HF deployment and external storage acceptance
remain pending. No ML package was loaded. No commit/push is performed by this task.

## Step 4 implemented — 31 October 2026

- **115 backend tests passed** on the disposable PostgreSQL 17 database, including additive
  cosmic_0005 upgrade/drift/downgrade and preservation of earlier view-v1 behavior. The one existing
  upstream Starlette/httpx deprecation warning remains. Dependency locks include SciPy/Pillow.
- Official R7 nominal channel summaries and middle/all-pixel responses were captured: 102 channels,
  210 SHA-pinned CSV members, using 20,063,233 bounded range-transfer bytes rather than the whole
  436,705,280-byte archive. [Calibration receipts](research/calibration/receipt.json).
- view-v2 now performs padded acquisition, release-aware PSF/ePSF inspection, conservative flag/
  variance masking, exact-FOV sky-fixed reprojection, squared-weight marginal variance, local
  visualization wavelength context, complete-link selection, held-out static-reference checks,
  explicit temporal bins and transparent shared/per-frame previews. Quantitative operations stay blocked.
- Synthetic controls verify moving-target exclusion, positive/insufficient registration support,
  independent post-reprojection residuals, variance algebra, RA wrap/poles, shared stretch/alpha,
  incompatible wavelengths despite identical detectors, explicit bin intensity/variance/times and
  preference for full requested footprints over larger edge-only samples.
- Publication tests prove raw and derived files roll back together if any prepared upload is missing,
  stale workers cannot finish twice, unpublished files are hidden, and raw/derived cleanup uses one
  ordered bounded cursor. Native/HTTPS repositories expose the same committed report.
- [All-five-target reprocessing](verification/frame_preparation_report.json): all 27 original FITS
  hashes verified and release-specific readers/quality/grid/preview processing executed. These old
  small native crops do not yield a supported multi-epoch comparable group; wavelength/coverage/
  registration limitations remain explicit. This is not phase-6 source recovery or motion evidence.
- [Live padded view-v2 job](verification/prepared_view_report.json) passed five checks: real job
  completion, single-input not represented as animation, PNG/FITS/JSON hashes and MIME types,
  local proxy versus nominal-channel distinction, and authenticated HTTPS report parity. The final
  full-footprint selection has 0.943333 requested-grid usable fraction; its larger padded input has
  0.984063 usable fraction. Those regions are reported separately. The earlier edge-only selection
  exposed low coverage and prompted footprint-aware sampling rather than a hidden crop.
- Actual live common-grid PNG was visually inspected. Metadata preserves native orientation, the
  common north-up grid, FITS/PNG origin convention, masks, WCS/units, source references and all
  relevant eligibility limits. No source identification or brightness/motion measurement is inferred.

The current prepared-frame/report contract is [documented here](frame_preparation.md). Full movie
manifests/React delivery remain step 5. Pipeline CWAVE/CBAND, exact per-pixel response, PSF matching,
photometric/background calibration and covariance-based quantitative acceptance remain unvalidated.
No cloud deployment, researcher-model integration, commit or push was performed.

## Step 3 implemented — 31 October 2026

- **100 backend tests passed** on the disposable PostgreSQL 17 database, including schema
  upgrade/drift/downgrade. One existing upstream Starlette/httpx deprecation warning remains.
- New anonymous view-v1 submissions, scoped idempotency/cancellation, PostgreSQL admission quotas
  and global queue/worker bounds are implemented without model/ranker/observation-ID prerequisites.
  cosmic_0004 adds view/submission/input-pin/upload-ledger tables without resetting existing data.
- Worker controls cover concurrent claims, expired-lease recovery, stale completion, changed input
  pins, cancellation and termination of a real sleeping child process. Native acquisition runs in a
  monitored subprocess, including uploads; compose adds CPU/memory/PID isolation.
- [Live API/worker proof](verification/views_report.json): actual coordinate request, IRSA QR3
  cutout transfer, FITS structural validation, stored SHA-256, verified artifact download and
  completed-input cache reuse. The first probe hit its earlier 60-second transfer budget and
  published nothing. The final probe passed with a 120-second transfer budget inside the 180-second
  monitored attempt limit. No partial file was relabeled successful.
- [Four authenticated TLS view checks](verification/views_gateway_report.json) passed: native view
  read parity, committed artifact lookup, transactional admission/replay and scoped cancellation.
- Local and S3-compatible adapters enforce immutable keys and byte/hash verification. S3 calls are
  contract-tested with the installed AWS SDK/Stubber; no external bucket is provisioned or claimed
  live-tested. Cleanup uses the upload ledger, with bounded eligible-object/staging batches.
- Docker API/worker built and ran with the shared persistent artifact volume. Dependency hashes were
  regenerated for boto3/resource monitoring; app changes now reuse the installed dependency layer.
  Active contracts/examples, SRS, plan, data model and deployment docs were updated.

Success means **inputs_ready**, not a registered viewer. Frame preparation/playback, scientific
eligibility, real cloud persistence/provider checks and deployment remain later slices. Reproduction
and exact limits: [view input guide](views.md). No commit, push or cloud deployment was performed.

## Step 2 implemented — 31 October 2026

- Coordinate normalization, bounded rectangular FOV searches and discovery-v1 are implemented.
  GET /releases, POST /targets/resolve, immutable product detail and snapshot pagination are enabled.
  Legacy radius searches now receive 410; analysis execution remains disabled.
- `cosmic_0003` adds source_products/discovery_snapshots without changing legacy observations or
  analysis FKs. Native PostgreSQL and authenticated TLS gateway lookup/save are verified; conflicting
  immutable content rolls back the entire save. Restricted discovery roles have no UPDATE/DELETE grant.
- [Live API report](verification/discovery_report.json) records all five required target searches,
  original query/status/response hashes, sampled dates/detectors, cache reuse, full page traversal,
  chronological order and native/HTTPS persistence parity. All results disclose incomplete samples.
  Final captured counts: Barnard 80, Epsilon Indi B 80, WISE 0855 40, RW Aurigae 79 and R Draconis
  80 unique exposure+detector entries. R Draconis's QR2 wide request was unavailable during this run;
  its QR2/QR3 deep samples still returned data. The failed source is retained in the report and
  completeness stays false; no complete-archive count or successful-source claim is substituted.
- Tests cover decimal/sexagesimal units, wrapping/poles/negative declination, FOV corners and
  footprint intersection, recorded QR2/QR3 schemas, changed units/columns/IDs, bad links/XML, INFO
  errors before/after tables, cap/overflow, time/band filters, retries/timeouts, empty/partial/outage,
  deduplication, TTL/revalidation, immutable conflict, frozen pagination and concurrency rejection.
- Final suite: **86 passed**, including PostgreSQL 17 upgrade/drift/downgrade; one existing upstream
  Starlette/httpx deprecation warning. Ruff lint/format, dependency checks and local docs links pass.
- Docker API image rebuilt; dependency sets unchanged. PostgreSQL schema upgrade/drift/downgrade
  uses the separate disposable migration test DB. See [discovery](discovery.md) for reproduction.

Local scientific wavelength/usable-pixel coverage still requires FITS inspection in step 4; the API
labels SIA's whole-image bounds and leaves local wavelength null. No movie, motion/variability
measurement, source detection or Hugging Face cloud deployment is claimed. Earlier entries below
describe their dated revisions; their statements that discovery was unavailable are now superseded.

## Steps 0 and 1 implemented — 29 October 2026

Scope clarification from the user: prepare/test locally because cloud resources are not configured.

- 48 backend tests passed against the hash-locked environment, including PostgreSQL 17 migration
  upgrade, metadata drift and downgrade on the separate disposable test database. One upstream
  Starlette/httpx deprecation warning remains; it does not fail the suite.
- Ruff lint/format and pip dependency checks pass. Production/build/test/full-dev locks and tested
  Docker base-image digests are recorded. Local API and root HF Docker images build successfully.
- [HF-image local smoke test](verification/image_smoke.json) verifies actual port 7860, runtime UID
  1000, native database readiness, five curated targets, Python version and dependency-lock hashes.
  The temporary smoke container was stopped. This is not a deployed Hugging Face Space.
- [Foundation verification](verification/foundation_report.json): eleven passing authenticated TLS,
  anonymous-denial, idempotency, concurrent claim, fencing, lease recovery, completion and real DB-restart
  persistence/reconnection checks. Native and distinct HTTPS repository/readiness transports are present.
- Additive cosmic_0002 creates processing_jobs and restricted RPCs. This does not enable a worker or
  public processing route. Existing observation/analysis submission still returns 503 as specified.
- Curated GET /api/v1/targets returns five verified source/epoch records; OpenAPI is exported from the
  actual app. It is a research snapshot, not live discovery or current apparent-position certification.
- [Five-target packet](research/target_feasibility/README.md): 20 successful bounded collection queries,
  27 pinned native cutouts, QR2/QR3 flag/PSF/ePSF inspection, expected-motion/native-scale comparisons,
  explicit SNR proxies/quality/coverage limits and real preview figures. No fabricated detections.
- Native pair previews use shared stretches and were visually checked. They remain unregistered;
  response/coverage/target-mask limitations are explicit. Passing a spectral proxy alone is not science approval.
- Source reports/raw response hashes and local documentation links were verified. Docker Desktop's
  stale runtime socket was backed up and startup recovered without data/volume/settings reset.

Outstanding by design: actual HF/provider connectivity/deployment, live discovery API, frame/worker
execution, registered public movies, quantitative coadds/differences/spectra/overlays and scientific
motion/variability recovery. Local preparation is not a cloud-connectivity claim. Reproduction:
[foundation guide](foundation.md), [target packet](research/target_feasibility/README.md).

## Planning revision — 29 October 2026

Earlier planning-only revision, retained below as history; the implementation entry above supersedes
its statements about routes/migration/target investigations remaining wholly unchanged.

The user supplied the full challenge description. The plan/SRS/pipeline/API/data/deployment/source
documents now prioritize a public coordinate-driven time viewer, all potential considerations and
the five required target tests. New module READMEs are planning boundaries only; actual routes,
request limits, migration and disabled registry are unchanged. Previous local research/tests below
remain historical evidence, not tests of the newly specified viewer. All five named target tests,
live discovery, coadds, spectra, overlays, public movie/share/embed and cloud DB transport remain pending.

Primary resource documentation was reviewed; the source register distinguishes documentation checks,
actual prior data captures, broken legacy links and untested adapters. No new scientific performance
or deployment claim is made by this revision. Submission rules/deadline remain separately unverified.

Revision checks: 36 Markdown files checked for code-fence/whitespace integrity and 66 local links
resolved; SRS contains 40 unique functional requirement IDs; all 11 consideration rows and all five
target names are present. Git diff whitespace checks passed. These are documentation checks, not
viewer/science tests. No new backend test run is claimed for this documentation-only revision.

## Existing foundation and research evidence — 26 October 2026

Baseline: 26 October 2026. Verification here covers the Cosmic Motion AI backend foundation,
not the future scientific/ML pipeline.

Checks performed so far:

- 43 backend tests passed: API identity/capabilities, honest unavailable discovery/execution, request bounds,
  duplicate IDs, time-window validation, calibration-label guard, pipeline stage ownership/order and
  sanitized database-readiness failure.
- New cases cover informational versus artifact/unknown flags, bad variance, invalid bandwidth,
  the PSF-header correction rule, local wavelength differences, distinct epochs, collection mismatch,
  PSF availability and real empty/populated metadata fixture parsing. Tests do not need network/FITS downloads.
- Research download regressions verify incomplete bodies, byte limits, changed hashes and disallowed
  redirects; failed downloads preserve an existing cached file and remove partial output.
- Migration upgrade, metadata drift check and downgrade passed against a temporary local SQLite database.
- Docker Compose configuration validated. PostgreSQL migration testing is configured in CI against a
  disposable service database; local SQLite success is not evidence that CI/PostgreSQL has run.
- Ruff lint and formatting checks passed; `pip check` reported no broken requirements.
- The renamed `cosmic-motion-api` editable package installed successfully with the CLI entry point.
- PostgreSQL offline migration SQL generation passed for all seven tables.
- OpenAPI snapshot generation passed; machine-readable request examples validate against current schemas.

Windows sandbox event-loop socket setup blocked TestClient startup; the successful test run executed
outside that sandbox. Existing upstream Starlette transport deprecation warning does not fail the suite.

Milestone-one research checks completed:

- Real IRSA SIA snapshots archived: QR2 150 rows/OVERFLOW and QR3 0 rows/OK for the bounded query.
  Overflow is explicitly incomplete. Original XML bytes/field names are preserved.
- Three real QR2 D2 FITS cutouts were downloaded, pinned by SHA-256 and inspected for units, UTC,
  WCS-WAVE, flags, positive variance, celestial overlap and local PSF references.
- The 17 May/22 June repeat passes `engineering-preflight-v1`: 353/400 common usable pixels and
  minimum local FWHM-interval overlap proxy 98.9222%. The same-detector negative control fails.
- The offline proof script checks pinned bytes and reproduces both outcomes. It records dependency
  versions, about 1.75 seconds for the probe and about 67.24 MiB maximum sampled RSS (not true peak).
- IRSA's official 3I/ATLAS metadata table downloaded and parsed: 259 rows; no positive mover image
  fixture was validated. Its DataLink access URLs are distinguished from direct FITS URLs.
- The diagnostic notebook executed top-to-bottom and saved tables and two figures; nbformat validation
  and HTML export succeeded. Exported figures were inspected directly. Full HTML/browser visual QA
  was blocked: the browser tool could not verify the current Windows browser URL and ended UI access.
  To finish that optional inspection, open `var/research/notebook/data_path_feasibility.html` locally.

See [research packet and reproduction commands](research/README.md). These are offline research helpers,
not implemented production pipeline stages or a live discovery API. QR2's legacy PSF is available;
current IRSA guidance recommends newer ePSF for scientific work. Full calibration/response and empirical
registration validation remain open, along with scientific reviewer approval of thresholds.

Not yet verified: full Docker image builds/runtime, live PostgreSQL roundtrip, production IRSA adapter,
science stage outputs, job worker, trained model accuracy/calibration, object storage,
frontend integration, Space deployment or full challenge compliance. Docker Desktop's Linux engine
was unavailable, so container builds/runtime and live local PostgreSQL checks could not be completed.

Small public metadata snapshots/manifests and real-data previews are bundled; FITS/weights are ignored.
No fabricated detections are returned. No previous
database/volume was reset. Repository history, authentication configuration and the local Python
environment were retained; no commit or push is performed by this change.
