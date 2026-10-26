# AegisEarth AI — Software Requirements Specification

| Attribute | Baseline |
| --- | --- |
| Document version | 1.0 — replacement product baseline |
| Date | 26 October 2026 |
| Status | Detailed engineering specification; scientific tolerances/model quality targets require validation |
| Product | AegisEarth AI — AI-assisted moving-source candidate detection in SPHEREx images |
| Developer scope | Backend only; frontend owned by another team member |
| Model ownership | ML researcher builds/trains/evaluates the model; backend developer integrates the supplied inference package |
| Stack | Python 3.12+, FastAPI REST, PostgreSQL, scientific image-processing libraries, Docker |
| Hosting | Hugging Face Docker Space API; external PostgreSQL and durable artifact/model storage |
| Existing repository | https://github.com/Ahiraf/AegisEarth |
| Challenge | https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/ |

## 1. Purpose and scope

Cosmic Motion AI will help public users inspect repeated SPHEREx observations of the same sky region,
notice changes, and investigate possible moving sources with understandable evidence. The backend
discovers image metadata, checks comparability, processes images, identifies candidate changes,
ranks them using a classical or validated learned model, and supplies reproducible results to a viewer.

The core public demo is: select compatible observations -> view original/aligned images -> compare
epochs -> inspect highlighted candidates -> inspect score meaning, quality warnings and source evidence.
The frontend team implements that public experience; this repository implements its backend contract.

This specification distinguishes required product behavior from current implementation. The scaffold
contains request contracts, metadata/schema, pipeline declarations, health checks and tests. Discovery,
scientific execution, durable workers, candidate serving and trained models remain future work.

### 1.1 Challenge alignment and verification boundary

The available official-domain challenge summary asks for public SPHEREx image viewing and inspection
of change over time. This product directly addresses that central workflow. The full challenge page
returned an error during research; detailed judging/submission criteria and exact deadline remain to
be verified. No eligibility or award outcome is guaranteed by technical alignment.
See [primary sources and challenge notes](docs/sources_and_challenge.md).

### 1.2 Release scope

| Scope | Included capabilities |
| --- | --- |
| Scientific baseline MVP | Real compatible image pair, trustworthy preprocessing/registration/difference, candidate hypotheses, classical score and evidence APIs |
| AI release | Evaluated CNN or Siamese ranker, immutable versioned weights, documented model card and score interpretation |
| Sequence extension | >=3 compatible observations, uncertainty-aware association and tentative track evidence |
| Frontend handoff | OpenAPI, stable result/artifact examples, image coordinate transforms and safe public reads |

Classical ranking is an explicit reference and fallback release mode selected before execution. It is
not mislabeled as a trained model. The AI release requires actual training/evaluation evidence.

### 1.3 Exclusions

- Confirmed discovery of a new planet/object, orbit determination, impact-risk calculations or Earth impact mapping.
- Arbitrary user URL fetching, unrestricted FITS uploads, public model/checkpoint uploads or training inside API requests.
- Full-sky bulk processing as a demo prerequisite, automated scientific alerts or permanent user accounts.
- Frontend implementation, frontend deployment and creation of scientific ground truth by software assumption.

### 1.4 Requirement conventions

“Shall” identifies a requirement for its release scope. Unmarked requirements apply to the scientific
baseline MVP. AI and sequence requirements are explicitly labeled. Numeric performance values below
are proposed engineering budgets pending measurements; scientific quality thresholds are not invented.
Stable IDs support test/acceptance traceability.

## 2. Actors, workflows and responsibilities

| Actor | Responsibility / access |
| --- | --- |
| Public viewer | Inspect curated/published comparisons, candidates and evidence without processing credentials |
| Trusted submitter / frontend server | Submit bounded analysis using protected backend credentials and poll status |
| Backend developer | API, metadata, processing orchestration, storage, worker reliability, model-serving integration and tests |
| Frontend developer | Sky/image viewer, blink/slider/side-by-side, navigation, accessible controls and evidence presentation |
| ML researcher | Model design, labels/datasets, training, scientific evaluation/calibration, reproducible inference package, weights and model card |
| Scientific reviewer | Compatibility/QC tolerances, interpretation and scientific validation approval |
| Maintainer | Configuration, migrations, deployment, data/model provenance and operational recovery |

| Use case | Main success flow | Required alternative |
| --- | --- | --- |
| UC-01 Discover | Search bounded sky/time region and choose observations | Explain no coverage, unavailable provider or incompatible metadata |
| UC-02 Compare | Validate observations, enqueue and process pair | Reject incompatible wavelengths/epochs/quality with evidence |
| UC-03 Inspect | Retrieve completed images/candidates and interpretation | A valid zero-candidate result remains distinct from failure |
| UC-04 Rank | Apply explicitly selected enabled ranker | Unsupported/unavailable model fails explicitly; no silent method substitution |
| UC-05 Track | Sequence release associates >=3 observations | Return ambiguity/outlier warnings and tentative status |
| UC-06 Operate | Monitor/cancel/retry/recover bounded jobs | Worker/storage failures preserve consistent state and private partial output |

## 3. Architecture constraints

**ARC-001:** The backend shall use feature modules under `app/modules/` owning their routers, schemas,
models, repositories, services and adapters as needed. Shared infrastructure belongs in `core`.

**ARC-002:** `pipeline` shall orchestrate explicit stage interfaces. Scientific functions shall operate
on arrays/metadata and be independently testable without a browser, database session or live provider.

**ARC-003:** FastAPI request handlers shall perform bounded validation/reads/submission, with expensive
download/CPU/model work executed by a dedicated durable worker. FastAPI BackgroundTasks alone shall
not be used as the durable processing queue.

**ARC-004:** PostgreSQL shall store observation, run, stage, model, candidate and artifact metadata.
FITS arrays, previews and weights shall live in an artifact-storage adapter, not large database blobs.

**ARC-005:** Database changes shall use versioned Alembic migrations and imported feature model metadata.
The replacement baseline targets a fresh database and shall not reset an unrelated existing database.

**ARC-006:** Backend packaging shall run as a non-root container. Hugging Face API deployment uses
port 7860; production database/artifact persistence shall be external and restart-tested.

## 4. Functional requirements

### 4.1 Observation discovery (`observations`)

| ID | Requirement |
| --- | --- |
| OBS-001 | Discover public SPHEREx products through a verified IRSA interface using bounded sky/time/collection constraints. |
| OBS-002 | Store internal observation IDs with provider product ID, collection, release, provenance and retrieval timestamp. Different releases/products shall remain distinguishable. |
| OBS-003 | Preserve footprint, coordinates/frame, source time/scale/precision, detector, calibration and wavelength context needed for comparison. |
| OBS-004 | Return paginated metadata summaries with stable IDs and source references. Empty search, upstream failure and schema incompatibility shall be distinguishable. |
| OBS-005 | Cache repeated discovery/download work using explicit keys/TTL; validate response status/schema/overflow before publication. |

### 4.2 Comparison compatibility (`comparisons`)

| ID | Requirement |
| --- | --- |
| CMP-001 | Validate overlapping sky coverage, distinct usable epochs, known time scales and sufficient common valid pixels. |
| CMP-002 | Validate local wavelength/bandwidth and release/calibration compatibility. Common detector label alone shall not establish compatibility. |
| CMP-003 | Return versioned check outcomes, blocking reasons, warnings and supporting measurements. Unknown required metadata shall block processing. |
| CMP-004 | Recheck compatibility/QC against downloaded cutouts before scientific execution; metadata discovery is not a guarantee of usable data. |

### 4.3 Jobs and orchestration (`analyses`, `pipeline`)

| ID | Requirement |
| --- | --- |
| JOB-001 | Accept authorized bounded submissions with server-known observation IDs and explicitly selected available mode/ranker. |
| JOB-002 | Persist accepted job/config/ordered inputs before returning 202; implement idempotency and return 409 on incompatible key reuse. |
| JOB-003 | Expose queued, running, succeeded, failed and canceled states, current stage and sanitized failure reason. |
| JOB-004 | Claim jobs atomically with worker lease/heartbeat and support bounded retry/recovery after worker death. |
| JOB-005 | Support cooperative cancellation, maximum attempts, deadlines and resource quotas. No request transaction shall remain open during heavy processing. |
| JOB-006 | Publish results atomically only after all required stages/outputs pass validation. Partial failed/canceled output shall remain private. |
| JOB-007 | Record stage attempt, input/output/checkpoint references, timing, QC metrics, config and code/model versions. |

### 4.4 Acquisition and preprocessing (`cutouts`, `preprocessing`)

| ID | Requirement |
| --- | --- |
| IMG-001 | Resolve source files/cutouts from trusted persisted provider metadata, with allowlisted scheme/host/path and redirect validation. |
| IMG-002 | Stream bounded downloads, preserve checksum/source provenance and validate FITS structure, HDUs/dimensions and decoded resource limits. |
| IMG-003 | Extract science, variance, flags, wavelength/WCS and relevant calibration/PSF context with units and origin conventions. |
| IMG-004 | Mask bad/NaN/saturated/edge/unsupported pixels; masked data shall not be treated as valid zero-valued signal. |
| IMG-005 | Estimate background and match appropriate photometric/PSF response with recorded methods, uncertainties and limitations. |

### 4.5 Registration and difference (`registration`, `differencing`)

| ID | Requirement |
| --- | --- |
| DIF-001 | Reproject compatible inputs onto a common celestial grid while preserving coverage/mask and tested pixel/sky mapping. |
| DIF-002 | Measure stationary-source alignment residuals and reject cases that fail the approved QC policy. |
| DIF-003 | Produce signed science-minus-reference difference, validity/coverage and uncertainty/significance artifacts. |
| DIF-004 | Document variance propagation and noise-correlation limitations introduced by resampling/convolution. A subtraction residual shall not itself be interpreted as motion. |

### 4.6 Detection and association (`detection`, `association`, `candidates`)

| ID | Requirement |
| --- | --- |
| DET-001 | Detect per-epoch sources and significant positive/negative residuals, recording centroid uncertainty, SNR, morphology and quality context. |
| DET-002 | Associate detections in celestial coordinates using time and measurement/registration uncertainty; preserve ambiguous alternatives. |
| DET-003 | Classify hypotheses as possible_motion, brightness_change, artifact or uncertain, with explicit evidence and warning codes. |
| DET-004 | Report displacement/angular evidence only with units, epochs and uncertainty; two-epoch evidence shall remain a candidate claim. |
| DET-005 | Support valid successful analyses with zero candidates and make their coverage/QC evidence accessible. |
| TRK-001 | Sequence extension: associate >=3 epochs into tentative tracks with supported detections, fit residuals/uncertainty and model-validity limits. |
| TRK-002 | Sequence extension: handle missing detections, outliers, crossing/ambiguous tracks and bounded association complexity without claiming an orbital solution. |

### 4.7 Ranking and AI (`ranking`)

| ID | Requirement |
| --- | --- |
| ML-001 | Provide a reproducible classical baseline with method/config version and explainable features. Output shall be labeled candidate_score. |
| ML-002 | AI release: integrate an evaluated CNN or Siamese ranker through the same explicit serving interface; an untrained/random model does not qualify. |
| ML-003 | Record immutable weights/preprocessing/data/code identifiers, supported input shape and inference resource requirements. |
| ML-004 | Distinguish candidate scores from calibrated probabilities. Probability labels require representative calibration/evaluation evidence and a referenced model card. |
| ML-005 | AI release: the ML researcher shall supply held-out evaluation/baseline comparison, precision-recall/false-positive and domain-shift evidence with a leakage-controlled split description. The backend shall retain/reference this evidence. |
| ML-006 | Model training/retraining shall be performed by the ML researcher outside backend delivery/API requests. The backend shall load only approved immutable supplied weights/inference code. |
| ML-007 | Expose which ranker/mode is enabled, and fail explicitly if the selected model is unavailable; silent ranker substitution is prohibited. |
| ML-008 | The researcher shall supply loading/inference code or an executable export, exact preprocessing/postprocessing, dependencies, input/output definitions and golden test cases. Backend acceptance shall reproduce reference outputs within agreed tolerances. |

The model input boundary is a handoff decision: it may consume raw cutouts, aligned pairs, difference
stamps or candidate features, or supply several scientific stages together. Logical pipeline stages do
not require the backend developer to rebuild model internals. Map the supplied package to those stages
explicitly and avoid duplicate normalization, registration or postprocessing. See [model handoff](docs/model_handoff.md).

### 4.8 Evidence and public delivery (`artifacts`, `candidates`)

| ID | Requirement |
| --- | --- |
| EVD-001 | Deliver original/aligned/difference previews, candidate stamps and machine-readable evidence with source attribution. |
| EVD-002 | Include image dimensions, tested overlay transforms/WCS, pixel-origin convention, orientation, display stretch, timestamps and wavelength context. |
| EVD-003 | Preserve full precision scientific artifacts separately from normalized browser previews. |
| EVD-004 | Serve published artifacts through opaque IDs or scoped URLs, with media type/checksum/cache policy and no arbitrary path access. |
| EVD-005 | Provide deterministic candidate pagination/detail and curated real-data examples for frontend integration. |

### 4.9 Health and operational capability

| ID | Requirement |
| --- | --- |
| OPS-001 | Liveness shall be independent of provider/database availability; readiness shall check required database/schema dependencies. |
| OPS-002 | Report scientific execution availability separately from API/database readiness; scaffold status shall not imply a functioning pipeline. |
| OPS-003 | Provide structured sanitized request/job/stage diagnostics and last-known operational status. |

## 5. Data and scientific contracts

### 5.1 Initial schema

Seven tables are defined: observations, analysis_runs, analysis_inputs, stage_executions,
model_versions, candidates and artifacts. Foreign keys retain run/input/result relations; observation
identity includes release/product namespace, and a run retains ordered distinct observation inputs.
Detailed columns and future migrations are specified in [data model](docs/data_model.md).

**DAT-001:** Source observation/product identity, original epoch/time scale, coordinate frame/units,
calibration/release and raw/checksum provenance shall survive processing and be inspectable from a result.

**DAT-002:** Numeric values shall be finite with domain-appropriate ranges. Unknown times, wavelength,
variance, uncertainty or identity shall remain unavailable with a reason, not silently defaulted.

**DAT-003:** Time conversion shall be explicit and validated, preserving original representation and
precision. Future UTC assumptions, leap-second representation and unsupported conversions shall be labeled.

**DAT-004:** Candidate score, source intensity, probability, displacement and detection significance are
different quantities and shall not be interchanged. UI rounding shall not overwrite retained precision.

**DAT-005:** Artifacts and model files shall have generated storage keys, hashes, byte counts, type,
lineage and visibility state. Atomic result publication shall reference a validated immutable manifest.

**DAT-006:** Retention/backups shall cover metadata and durable files consistently. Proposed demo
retention is release-long curated results and seven-day failed temporary artifacts, pending budget/terms.

### 5.2 Scientific validation

The team must establish acceptable wavelength overlap, time separation, usable coverage, registration
residual, background/PSF mismatch, detection and association thresholds from representative data.
These values remain TBD until feasibility measurements and scientific review; software defaults shall
not be advertised as validated thresholds. See [science and ML validation](docs/science_ml_validation.md).

Required controls include stationary sources, injected movers, brightness-only changes, blended sources,
bad pixels, saturated/edge regions, calibration/PSF differences and poor alignment. Injection recovery
alone does not establish real-world precision. A human/reviewer role must approve scientific claims.

## 6. Interface requirements

**API-001:** JSON REST shall be versioned under `/api/v1` and described by OpenAPI. Requests shall
reject unknown fields, invalid coordinates/time windows, duplicate IDs and non-finite/out-of-bounds values.

**API-002:** Current scaffold discovery/analysis routes shall return 503 feature_not_ready after schema
validation until their implementations exist. Capability output shall disclose disabled stages/methods.

**API-003:** Implemented durable submission shall return 202 only after persistence, with a stable job ID
and status URL. State polling shall expose completion/failure without returning fake empty science data.

**API-004:** Planned errors shall distinguish 404 unknown resource, 409 conflict, 422 invalid input/
compatibility as documented, 429 quota and 503 unavailable capability/dependency. Error logs may retain
diagnostic detail but public responses shall be sanitized and traceable by request/job ID.

**API-005:** Collections shall use stable `{items,total,limit,offset}` pagination. Provider results may
have different native pagination; adapters shall normalize it and disclose limits/overflow.

**API-006:** The frontend shall receive documented evidence/overlay coordinate conventions and safe
artifact URLs, without database/provider credentials or Python-specific serialized objects.

Implemented/scaffold routes: GET health/live, health/ready, system/capabilities; POST observations/search
and analyses. Planned routes include observation detail, compatibility validation, job status/cancel,
candidate list/detail, artifact access and enabled model metadata. See [API contract](docs/api_contract.md)
for examples and target behavior. No frontend is hosted by the backend container.

## 7. Resource, quality and operational requirements

Proposed budgets must be measured on recorded hardware/data before acceptance.

| ID | Area | Requirement / target |
| --- | --- | --- |
| NFR-001 | Request limits | Search radius <=0.1 degree, window <=730 days, limit <=100; 2–6 input observations; cutout width <=5 arcmin and common-grid longest edge <=512 pixels. |
| NFR-002 | Input resources | Default download cap 128 MiB/object and timeout 30 s; enforce decoded FITS dimensions/HDU/memory and total-job limits before processing. |
| NFR-003 | API performance | Proposed warm cached metadata/status p95 <=500 ms at 10 concurrent clients; measure separately from upstream network and scientific jobs. |
| NFR-004 | Job performance | Proposed cached two-epoch 256x256 classical processing <=60 s on agreed 2-vCPU/16-GB worker; initial deadline 180 s pending measurement. |
| NFR-005 | Durability | API/worker restart shall not lose accepted jobs or publish partial output. Worker retries/leases/cancellation shall be tested. |
| NFR-006 | Storage | App restarts shall not erase published metadata/artifacts/weights; production uses external persistence and tested restore. |
| NFR-007 | Scientific quality | Numeric QC and ML quality targets require representative data and reviewer approval before production claims. No unmeasured accuracy target is asserted. |
| NFR-008 | Reproducibility | Results shall identify sources, code/config/pipeline/dependency/model versions and transformations. A repeated controlled run shall reproduce within documented tolerances. |
| NFR-009 | Testability | Unit/scientific tests shall run on clearly synthetic/generated data; PostgreSQL and real permitted-use fixture integration tests shall supplement them. |
| NFR-010 | Observability | Record request/job/stage IDs, timings, retries, failure class and worker/queue health without secret leakage. |
| NFR-011 | Maintainability | Feature ownership, typed interfaces, migrations, scientific function separation and frontend handoff examples shall accompany implementation. |
| NFR-012 | Availability | No always-on SLA is assumed for a sleeping demo Space; validate wake/restart behavior and support labeled precomputed public demo results. |
| NFR-013 | Accessible handoff | Evidence shall include text metadata and candidate lists usable without relying only on image color/overlays. Frontend owns final accessibility implementation. |

## 8. Security and privacy

**SEC-001:** Expensive submission/cancellation shall be protected before enabling execution, with bounded
quotas and concurrency. Public access to curated read-only examples may remain unauthenticated.

**SEC-002:** Submission secrets shall remain in trusted backend/frontend-server environments. A public
React bundle shall not contain a shared processing credential. Anonymous processing requires a separate
explicit quota/abuse-control design, not merely permissive CORS.

**SEC-003:** Remote fetches shall validate trusted destinations and redirects and deny arbitrary/private
network URLs. Input image decompression/array allocation and local artifact paths shall be bounded.

**SEC-004:** Production shall use HTTPS, database/storage TLS, least-privilege credentials and sanitized
logs/errors. Source attribution/license notices shall be preserved for data/calibration/model artifacts.

**SEC-005:** Model loading shall use approved immutable artifacts; untrusted pickle/checkpoint execution
and public model uploads are excluded. Dependency/model provenance shall be reviewed before activation.

**SEC-006:** MVP shall not collect learner profiles, precise visitor location or persistent personal data.
Any later accounts/analytics/retention expansion requires a documented change.

## 9. Deployment requirements

**DEP-001:** Local Compose shall start fresh PostgreSQL, apply the replacement migration once and then
start the API. It shall not silently reuse/reset an unrelated prior schema or delete existing volumes.

**DEP-002:** The root Dockerfile shall serve the backend API on Hugging Face port 7860 as UID 1000.
Frontend code, build tooling and containers shall remain outside this backend-only delivery.

**DEP-003:** Production shall use external PostgreSQL and durable artifact/model storage. Apply migrations
as a controlled release step, and verify network access, secrets, persistence and database/object restore.

**DEP-004:** Worker topology shall be chosen and tested before enabling submissions. A separate durable
worker is preferred; a co-located supervised worker must recover safely across Space sleep/restart.

**DEP-005:** CI shall exercise lint/API/schema tests, PostgreSQL migration/drift checks and subsequently
scientific stage/queue/storage integration tests. Release checks shall include image start, readiness,
capability accuracy, trusted CORS and complete evidence retrieval.

## 10. Acceptance and traceability

| Requirement group | Use cases / owners | Required acceptance evidence |
| --- | --- | --- |
| ARC-001–006 | All / backend | Module/interface review, migration registry, worker separation and image inspection |
| OBS-001–005 | UC-01 / observations | Real compatible-pair manifest, metadata/API fixture and empty/failure tests |
| CMP-001–004 | UC-02 / comparisons | Positive/negative compatibility reports and reviewed tolerances |
| JOB-001–007 | UC-02, UC-06 / analyses | Idempotency, atomic claims, crash/retry/cancel and publication tests on PostgreSQL |
| IMG-001–005 | UC-02 / cutouts, preprocessing | FITS/mask/unit/size tests, trusted download and storage evidence |
| DIF-001–004 | UC-02 / registration, differencing | Stationary controls, measured registration/PSF QC, difference/variance tests |
| DET-001–005 | UC-03 / detection, association | Motion/variable/artifact/uncertain and zero-candidate cases with provenance |
| TRK-001–002 | UC-05 / association | Sequence/outlier/ambiguity tests and tentative-fit evidence |
| ML-001–008 | UC-04 / ranking, ML researcher | Researcher evaluation/model card, immutable package, inference-parity and score-label tests |
| EVD-001–005, API-001–006 | UC-03 / artifacts, frontend handoff | OpenAPI, preview/overlay coordinate tests, sample manifests and protected access |
| DAT-001–006 | All / database, science | Schema integrity, source/transform audit and storage/backup consistency |
| OPS-001–003, NFR-001–013 | UC-06 / operations | Health failures, resource/load measurements, reproducibility and diagnostics |
| SEC-001–006, DEP-001–005 | All / deployment | Credential/URL/file-boundary tests, image/worker restart and restore smoke checks |

### 10.1 Scientific baseline exit

- A real compatible SPHEREx pair is retrieved reproducibly with source/time/wavelength/calibration metadata.
- Durable job execution processes it with reviewed alignment/mask/variance/PSF/detection controls.
- Candidate motion/brightness/artifact/uncertain interpretations include evidence; zero candidates is valid.
- Classical scores are correctly labeled; artifacts and frontend overlay contracts work end-to-end.
- PostgreSQL/worker/storage/recovery/security checks and measured resource budgets pass.

### 10.2 AI-release exit

- A trained CNN/Siamese model is reproducible, evaluated against baseline on a leakage-controlled split
  and approved for its intended data conditions.
- Serving matches training preprocessing, uses identified weights and meets measured resource limits.
- Model card, subgroup/failure evidence and calibration labels are truthful and inspectable.

### 10.3 Public-demo exit

The frontend team demonstrates image comparison and candidate evidence on real SPHEREx data using
the documented backend. A curated cached fallback is visibly identified. Full challenge rules/deadline,
data/model attribution and submission requirements are verified before team submission.

## 11. Open decisions and delivery control

| Decision | Resolution needed |
| --- | --- |
| Official full brief/rubric/deadline | Verify current authoritative resources; do not infer from older years |
| Real target field/epochs/release | Milestone 1 feasibility, including actual usable image pair |
| Scientific QC thresholds | Measurements and qualified review before enabling scientific stages |
| Researcher model package and interface | Ownership confirmed; agree input boundary, runtime, goldens and delivery version before integration |
| Model architecture/runtime | Researcher selects/trains the model; backend follows the delivered inference interface and resource requirements |
| Storage provider and worker hardware/topology | Budget, Space networking/sleep and benchmark results |
| Public submission access | Trusted frontend-server proxy for MVP; anonymous jobs require further design |

Detailed implementation order is in [todo_plan.md](todo_plan.md). Changes to scope, science assumptions,
schemas or API behavior shall update this SRS, the pipeline/API contract and acceptance tests together.
No commit/push is performed without the user's explicit request; use main and anindya357 when authorized.

## 12. References

- [Official challenge URL](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/)
- [Official-domain challenge summary](https://www.spaceappschallenge.org/2026/find-a-team/lsp26/)
- [IRSA SPHEREx access](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/)
- [IRSA SPHEREx products](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/)
- [IRSA cutouts](https://irsa.ipac.caltech.edu/ibe/cutouts.html)
- [Backend pipeline](docs/backend_pipeline.md), [data model](docs/data_model.md), [API contract](docs/api_contract.md)
- [Scientific/ML validation](docs/science_ml_validation.md), [deployment](docs/deployment.md)
