# AegisEarth — Software Requirements Specification

| Attribute | Baseline |
| --- | --- |
| Version / date | 2.7 — survey context, refresh/sharing/export implementation, 2 November 2026 |
| Product | AegisEarth — public SPHEREx sky time viewer with optional AI-assisted hints |
| Required journey | Enter RA/Dec → choose sky patch/band → inspect chronological frames like a movie |
| Backend ownership | FastAPI REST, PostgreSQL, Python processing, Docker and Hugging Face API |
| Frontend ownership | Separate React developer: public viewer, playback, sky map and accessibility |
| ML ownership | Researcher trains/evaluates/supplies inference package; backend integrates it only |
| Repository | https://github.com/Ahiraf/AegisEarth — name unchanged |
| Challenge | https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/ |
| Evidence source | Complete description pasted by the user; organizer resource package not supplied |

## 1. Purpose, priorities and implementation status

AegisEarth helps anyone inspect changes in SPHEREx sky images over time. The brief requires a public coordinate-
driven image sequence and testing on Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae and
R Draconis. Motion and brightness variation are both relevant. Automatic object detection is not
necessary to deliver that experience. The model is an optional enhancement, never a viewing prerequisite.

The user has adopted **all potential considerations** as expanded-release requirements: new releases,
102-band exploration, six detector composites, spectra, image addition/subtraction, variable FOV,
Gaia/WISE context, coordinate URLs/embedding, quality metadata and appropriate astronomy tools.
They are optional in the original brief, but included in this project's scope. See [coverage](docs/challenge_alignment.md).

| Release | Required scope |
| --- | --- |
| Core viewer | Public RA/Dec/FOV search, real chronological SPHEREx frames, accessible playback handoff, quality/source context, tests on all five named targets |
| Expanded challenge release | Core plus every adopted consideration and measured hosting/recovery behavior |
| Optional AI enhancement | Researcher-supplied inference, verified parity and honest candidate hints |

**Actual implementation:** health/config/CORS, initial seven-table migration, strict observation/analysis
request scaffolds, disabled eleven-stage registry and offline QR2/QR3 research helpers exist. Additive
cosmic_0002 processing-job/RPC persistence, selectable native/HTTPS readiness and curated GET /targets
are implemented and locally verified. Step 2 adds discovery-v1 coordinate/FOV/time/band queries,
GET /releases, coordinate normalization, immutable product/snapshot persistence (cosmic_0003),
TTL revalidation and stable pagination over bounded IRSA results, through native SQL or HTTPS.
All five targets have live discovery evidence and real native-cutout evidence. Analysis remains 503;
legacy radius search is explicitly retired with 410. No model or measured target motion/variability is implemented; public cloud deployment remains pending. See [discovery](docs/discovery.md), [foundation](docs/foundation.md)
and [target evidence](docs/research/target_feasibility/README.md).
Step 3 implements anonymous view submission, transactional quotas/idempotency, scoped cancellation,
isolated native acquisition workers, byte/FITS integrity, local/S3 adapters, artifact reads and bounded
ledger cleanup. Additive cosmic_0004 preserves existing data. Completion means inputs_ready, not a
registered movie. See [view input contract](docs/views.md).
Step 4 now implements view-v2 frame preparation, official 102-channel/response metadata, release-aware
PSF/ePSF readers, strict masks, exact sky-fixed grids, marginal variance propagation, held-out static
reference checks, explicit temporal bins and shared-stretch transparent previews. cosmic_0005 adds
atomic raw/derived publication. WCS-WAVE wavelengths remain visualization proxies; quantitative
CWAVE/CBAND/response/PSF/photometric acceptance is not claimed.
See [prepared frame contract](docs/frame_preparation.md).
Step 5 implements movie-v1 immutable manifests/pages, explicit no_data/single_epoch/ready_for_animation,
UTC intervals/physical gaps, provenance/WCS/coverage/warnings, conditional caching and primary 2D FITS
for Aladin. Additive cosmic_0006 preserves earlier views. A separate React/Aladin reference demonstrates
real coordinate-to-animation without ML, controls/accessibility and widget-failure isolation locally.
Quality-limited browsing does not assert scientific comparison eligibility. Frontend-owner handoff acceptance is user-confirmed on 1 November 2026. Public cloud deployment and five-target scientific claims require separate evidence.
See [movie delivery contract and evidence](docs/movie_delivery.md).
Step 6 executes all five target investigations with real API frames, epoch-specific catalog predictions, strict-mask aperture diagnostics, proper-motion/resolution comparisons and retained source/config hashes. WISE 0855 is tested at both its supplied unknown-epoch seed and the separately predicted catalog position. Scientific detection/motion/variability remain unvalidated where masks, calibration or references do not support them. See [executed target receipts](docs/verification/targets/README.md).
Steps 7–8 implement shared-quota derived jobs, D1–D6 coadd selection, exact exported coefficients/masks/count/exposure maps, shared-stretch composites, strict signed-difference eligibility, and native point-source aperture spectra in physical uJy with sparse epoch-specific JSON/CSV. Additive cosmic_0007 preserves prior data. Numerical extraction is verified against an independent analytic reference. Real spectra remain diagnostic; frames-v1 does not establish science-grade CWAVE/CBAND, PSF/background/calibration/covariance acceptance, so actual signed differences are refused with reasons. See [derived implementation and remaining science gates](docs/derived_operations.md).
Steps 9–10 implement bounded Gaia DR3/AllWISE catalog context, W1/W2 images on each selected frame grid, explicit proper-motion limits, versioned coordinate-state restore, finite frozen-ID links, reference iframe playback, PostgreSQL refresh leases/cooldowns and captioned asynchronous GIF/metadata exports. Additive cosmic_0008 preserves old views. New production React controls, an external scheduled runner and public-host embedding acceptance remain deployment/integration work. See [context, sharing and export contracts](docs/context_sharing.md).
This document describes target behavior. Existing OpenAPI remains the actual runtime contract.

Excluded/deferred: full-sky searches, orbit/automatic track solutions, discovery confirmation, impact
risk, geography, training APIs, unrestricted uploads, user accounts/social annotation and mandatory
backend-built classical ranking. Preserve existing disabled interfaces pending deliberate migration.

## 2. Actors, use cases and boundaries

| Actor | Responsibilities |
| --- | --- |
| Public visitor | Enter coordinates/FOV/dates/band; play/step/blink, inspect flags, overlays/spectrum and share/embed |
| Backend developer | Providers, normalization, files, jobs, processing, manifests, APIs and production integration |
| Frontend developer | React UI/Aladin integration, timing controls, overlays/charts, responsive/accessible public experience |
| Scientific reviewer | Review astrometry, response/PSF, photometry, uncertainty and claims |
| ML researcher | Optional model design/training/evaluation/calibration, inference package and goldens |
| Operator | Release refresh, credentials, quotas, worker/storage health and organizer submission checks |

Primary use cases: UC-01 coordinate/FOV discovery; UC-02 play a time sequence; UC-03 inspect/select
bands/metadata; UC-04 add/subtract/coadd; UC-05 spectrum/brightness comparison; UC-06 Gaia/WISE
context; UC-07 share/embed/export; UC-08 refresh releases; UC-09 optional AI hints.

## 3. Functional requirements

Unless marked expanded or AI, requirements apply to the core viewer. “Shall” denotes planned required
behavior, not an implementation claim. All requirements need the evidence listed in section 8.

### 3.1 Coordinates, target presets and field selection

| ID | Requirement |
| --- | --- |
| SKY-001 | Accept decimal-degree RA/Dec and explicitly recognized sexagesimal input; normalize to ICRS degrees, reject ambiguous/invalid/nonfinite input and test RA wrapping/poles. |
| SKY-002 | Accept FOV and optional time window; discover available dates on first visit. Search footprints must cover the full requested rectangle, including corners. |
| SKY-003 | Supply five named target presets with verified identities, source positions, reference epochs/proper-motion provenance and documented uncertainty. Name resolution is convenience; direct coordinate entry remains available. |
| SKY-004 | Default to sky-fixed views so motion remains visible. Source-tracked/recentered modes, if added, shall be explicit and not presented as sky-fixed evidence. |

### 3.2 Observation and release discovery

| ID | Requirement |
| --- | --- |
| OBS-001 | Query public IRSA SIA and use documented TAP/DataLink where needed; normalize QR3/QR2 wide/deep and retain immutable product/release/calibration identities. |
| OBS-002 | Preserve footprint, detector, actual times/scale, local spectral coverage, units, quality, source links and retrieval/snapshot provenance. |
| OBS-003 | Handle errors/empty results/OVERFLOW distinctly; expose completeness and available epochs without claiming a bounded sample is the full archive. |
| OBS-004 | Deduplicate the same exposure across reprocessed products; acquisition time, processing date and retrieval date shall remain distinct. |
| REL-001 | Expanded: add releases through versioned source adapters/registry; publish last-checked/cache state and bounded refresh without replacing frozen published views. |

### 3.3 Image preparation and temporal playback

| ID | Requirement |
| --- | --- |
| IMG-001 | Acquire bounded trusted cutouts; validate HDUs/dimensions/units/flags/variance/WCS and release-specific PSF/ePSF, preserve raw SHA-256 and avoid arbitrary URL fetching. |
| IMG-002 | Preserve masks and missing coverage; informational SOURCE/FULLSAMPLE flags shall not be treated as universal bad pixels. Quality-policy versions accompany derived artifacts. |
| CMP-001 | Distinguish native display, comparable movie, quantitative difference and photometry eligibility. Failure of a strict operation must not hide all inspectable originals. |
| CMP-002 | Comparable sequences use consistent local wavelength support and a common sky grid/orientation/FOV. Same detector label alone does not prove comparable spectral response. |
| CMP-003 | Measure common coverage and registration uncertainty from suitable references independently of the target; label insufficient support and unvalidated mappings. |
| VIEW-001 | Publish a stable, chronologically ordered frame manifest with timestamps, real elapsed gaps, wavelength, grid/WCS, stretch, quality, source attribution and artifacts. |
| VIEW-002 | Expose no_data/single_epoch/ready_for_animation honestly; at least two distinct usable observing epochs are required for an animation claim. |
| VIEW-003 | Supply data for play/pause/loop/speed/scrub/step/blink/side-by-side; React implements those controls, keyboard access and reduced-motion behavior. Physical time gaps remain visible. |
| VIEW-004 | Use common default intensity stretch for comparable epochs so brightness changes persist; independently stretched frames must be labeled. Original scientific arrays remain separate from display pixels. |
| VIEW-005 | Use bounded previews/preloading/pagination for playback; a server-encoded video and AI inference shall not be required to view time changes. |

### 3.4 Spectral exploration, six detector composites and arithmetic

| ID | Requirement |
| --- | --- |
| BAND-001 | Expanded: expose 102 nominal-channel metadata, six detectors and actual local per-epoch coverage; show unsupported channels explicitly rather than invent samples. |
| BAND-002 | Expanded: build D1–D6 composites per bounded time bin with defined common spectral support, weights, contributor/coverage/response maps and uncertainty. |
| ADD-001 | Expanded: coadd selected inputs with documented sum/weighted-mean semantics and units; retain all contributors/times and warn about motion smearing/variability dilution. |
| DIF-001 | Expanded: produce signed later-minus-earlier differences only for validated local-response, calibration, registration, background and PSF/ePSF compatibility. |
| DIF-002 | Expanded: propagate masks/coverage/variance and record noise-correlation limits. Residuals alone shall not be classified as motion or discovery. |

### 3.5 Spectra and brightness evidence

| ID | Requirement |
| --- | --- |
| SPC-001 | Expanded: a clicked coordinate/aperture and epoch group produces available wavelength/flux-density/error/flag/response samples with method and source provenance. |
| SPC-002 | Expanded: use reviewed local photometry/ePSF or a verified documented official tool interface; account for background, pixel solid angle, aperture/PSF correction, blends and saturation. |
| SPC-003 | Expanded: preserve epoch grouping and explicit moving-source positions; mark missing coverage/nondetections/upper limits and avoid fabricated 102-point spectra or mixed-epoch variable-source spectra. |
| SPC-004 | Expanded: provide plot-ready JSON/CSV and comparable per-epoch flux evidence with units/uncertainty; React renders spectra/charts. |

### 3.6 Cross-survey context and metadata

| ID | Requirement |
| --- | --- |
| OVL-001 | Expanded: offer Gaia catalog markers and WISE image/catalog context with source IDs, native epoch/time span, band, quality, uncertainty and attribution. |
| OVL-002 | Expanded: use tested coordinate transforms and epoch-aware proper-motion propagation where supported; mark incomplete astrometry and apparent-position/parallax limits. A prediction is not an image detection. |
| OVL-003 | Expanded: overlay failures shall be isolated. WISE images cannot silently replace missing SPHEREx frames; unlike survey images are not directly subtracted without separate validation. |
| META-001 | Expose decoded contamination/mask summaries, coverage, timing, wavelength, calibration, operations and warnings in text/JSON as well as images. |
| TOOL-001 | Expanded: use Astropy/unit-aware WCS and evaluate Aladin Lite v3 with the React owner; validate FITS/catalog/CORS/coordinate behavior instead of assuming compatibility. |

### 3.7 Share, embed, exports, jobs and optional AI

| ID | Requirement |
| --- | --- |
| URL-001 | Expanded: coordinate query URLs restore normalized RA/Dec/FOV/dates/band/mode; immutable view-ID links reproduce frozen data/config versions. No credential appears in the URL. |
| URL-002 | Expanded: support an embeddable frontend route with explicit framing/CORS policy and test an actual iframe in a second site. Backend supplies safe normalized state/manifest/artifacts. |
| EXP-001 | Expanded: provide JSON/CSV metadata/spectrum and derived FITS exports; optional asynchronous GIF/MP4 includes time/band captions and provenance. |
| JOB-001 | Public viewing requests are anonymously usable within server-enforced quotas/cache/queue limits; admin refresh/bulk operations require server-side authorization. |
| JOB-002 | Return 202 only after durable persistence; support idempotency, leases, bounded retries/deadlines/cancel and atomic manifest publication. Do not publish partial scientific output as complete. |
| ML-001 | AI only: integrate the researcher's versioned package/goldens; backend does not train or duplicate delivered preprocessing. |
| ML-002 | AI only: retain model/evaluation/calibration evidence and score meaning; uncalibrated scores are not probabilities. Inference failure must not break other viewer features. |

## 4. Architecture and data contracts

Feature modules: targets, releases, observations, views, bands, coadds, spectra, overlays and existing
cutouts/preprocessing/registration/comparisons/differencing/artifacts/analyses/health. Detection,
association/ranking/candidates are optional. Scientific functions consume arrays/metadata rather than HTTP/ORM.
Heavy work runs in leased workers; FastAPI orchestrates validated requests, status and published results.

The seven-table `cosmic_0001` baseline remains intact; cosmic_0002 adds processing-job persistence
and restricted gateway RPCs. Add versioned view requests/frames/contributors,
release snapshots, band definitions, processing jobs, spectra and overlay snapshots via migrations as
their slices are implemented. Adapt analysis_runs/stage_executions where useful; do not force movie
frames through a model/candidate relation. [Data model](docs/data_model.md) defines proposed relations.

Every frame identifies original observing interval/time scale, effective/local response, contributors,
release/calibration, masks, grid, transforms, display stretch and checksum. Files reside in object
storage; PostgreSQL retains metadata/relations. Original values and normalized display pixels differ.
Catalog reference epoch is separate from coordinate frame/equinox and observation/retrieval time.

The old engineering-preflight-v1 QR2 policy remains a historical development control, not a universal
viewer gate or a scientifically approved coadd/difference/spectrum threshold. Review separate operation
policies with representative data. Registration, masks and coadds must not erase the target's motion.

## 5. API contracts and limits

All new routes are planned, under `/api/v1`; details and examples are in [API contract](docs/api_contract.md).
Actual OpenAPI still contains health/capabilities plus unavailable observation/analysis scaffolds.
New views/frames/bands/targets/spectra/overlays/releases/export routes must be implemented and documented
before use. Do not send the new view example to the old strict AnalysisRequest schema.

Proposed starting ceilings, to be configured and measured before activation:

| Resource | Planned budget / semantics |
| --- | --- |
| FOV | 1–30 arcmin square, default 5; reject oversize explicitly and report actual footprint/coverage |
| Discovery | ≤0.5-degree enclosing cone, ≤5-year time window, ≤100 rows per page, bounded continuation |
| Processing | ≤60 output frames and ≤300 source products per job; offer explicit time-bin/batch choices beyond limits |
| Arrays | Common-grid longest edge ≤512 pixels for the first release; preserve pixel scale and original native metadata |
| Downloads | ≤128 MiB/source, ≤1 GiB/job, streaming limits and total deadline; no large array allocation before inspection |
| Queue | Initially one CPU worker slot; per-client/global quotas and request/job deadline configurable after benchmarks |
| Catalogs | Bounded cone/rows, overflow disclosed; optional overlays time out without blocking the base viewer |

These differ from the unchanged legacy scaffold (radius ≤0.1°, 730 days, 2–6 observations, cutout ≤5′).
Introduce versioned viewer schemas/capabilities/tests rather than silently loosening every old endpoint.
Limits cannot silently crop the FOV, drop epochs or claim full coverage after sampling.

Errors distinguish invalid/ambiguous input, no_data, partial discovery, source unavailable, quota,
unsupported operation/calibration and failed processing. A nondetection is not an upstream failure.
Unknown resource 404, invalid request 422, quota 429 and disabled capability 503 remain explicit.

## 6. Nonfunctional, security and hosting requirements

- Public use shall not require astronomy expertise, accounts, an ML package or a private submission token.
  Return understandable empty/quality states and text alternatives; React owns final accessibility testing.
- Enforce rate/queue/byte/frame/memory/time limits, cancellation ownership and cache keys server-side.
  Keep refresh/admin credentials and DB/object/model secrets out of React, links and logs.
- Fetch only trusted versioned sources/redirects, validate FITS allocations and restrict artifact paths.
  Use HTTPS/TLS, least privilege, immutable files, sanitized diagnostics and data/software credits.
- Accepted jobs and published artifacts survive worker/API/Space restart; backups restore DB/file references
  together. Keep publication atomic and partial files private until validation.
- Record cold/warm latency, throughput, RSS/CPU/bytes and hardware for the five targets and larger FOVs.
  No production latency, SNR gain, motion sensitivity or accuracy guarantee follows from the small M101 probe.
- API Docker Space uses port 7860/UID 1000. PostgreSQL/object storage persist externally; worker/scheduler
  placement accounts for Space sleep. Hosting/network/cost decisions must pass early smoke tests.
- HF documents outbound 80/443/8080, so default PostgreSQL 5432 cannot be assumed reachable. Prove
  an allowed database transport or implement a separate authenticated HTTPS repository adapter/gateway
  with transaction-safe functions. Run Alembic/native workers in a DB-reachable environment; do not
  misconfigure an HTTPS gateway as a psycopg URL. [Deployment](docs/deployment.md) tracks this gate.

## 7. Scientific interpretation and ownership

The challenge names movers and variables; the product shall not force all changes into a motion class.
Spectral response, PSF/calibration, artifacts, blends and alignment can mimic change. Six-detector
composites need stable response support across epochs; broad detector equality alone is insufficient.
Temporal stacks can smear moving sources. Catalog propagation may omit observer-dependent apparent
position/parallax effects; scope those predictions and uncertainty honestly.

The ML researcher supplies training/evaluation/calibration and the inference contract. Backend acceptance
checks supplied-output parity and operation/resource behavior, not a new scientific accuracy certification.
The reviewer approves quantitative policies/claims; no calibrated-probability label without evidence.

## 8. Acceptance and traceability

| Requirement group | Required evidence |
| --- | --- |
| SKY, OBS, REL | Coordinate edge cases; source metadata/release migration, overflow/refresh/dedup and real discovery receipts |
| IMG, CMP, VIEW | Real chronologically ordered aligned frames, shared stretch, masks/coverage and React playback/accessibility |
| BAND, ADD, DIF | Six detector options, response/contributor maps, analytical coadd/variance controls and validated signed subtraction |
| SPC | Reference extraction, units/errors/missing coverage, variable/moving position cases and CSV/JSON |
| OVL, META, TOOL | Gaia/WISE epoch-aware layers, actual Aladin/FITS transform/CORS test and decoded contamination metadata |
| URL, EXP | Coordinate URL restore, frozen view reproduction, real iframe test and attributed exports |
| JOB / hosting | Atomic persistence/claims, restart/cancel/quota tests through the selected PostgreSQL transport |
| ML | Optional supplied-model golden parity, provenance/resources and failure isolation |

All five targets must be tested as defined in [target_validation.md](docs/target_validation.md). Record
whether data, display, measurable motion/variability and quantitative processing are supported separately.
A target test with a documented real nondetection does not prove visible-motion sensitivity; lack of
usable epochs remains a visible release limitation to investigate, not a successful animation claim.

Core exit: publicly usable coordinate time viewer and recorded tests for all five targets. Expanded exit:
every adopted consideration has working acceptance evidence. Neither exit requires model training or
automated tracking. Organizer submission rules/deadline remain separately unverified; the supplied
description resolves objective/feature alignment, not those rules.

## 9. Delivery control and references

Implementation order: [todo_plan.md](todo_plan.md). Full mapping: [challenge_alignment.md](docs/challenge_alignment.md).
Public resources and verification limits: [sources_and_challenge.md](docs/sources_and_challenge.md).
Existing research: [data-path packet](docs/research/README.md). Optional [model handoff](docs/model_handoff.md).

No commit/push without explicit request. Authorized Git actions use main and anindya357, preserve history
and retain the frontend owner's work. This revision changes planning/documents, not enabled runtime features.
