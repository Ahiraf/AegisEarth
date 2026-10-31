# Data model: views, observations and derived products

Updated 29 October 2026. The seven-table `cosmic_0001` baseline is preserved. Additive
`cosmic_0002` now adds `processing_jobs` plus restricted PostgreSQL gateway functions, verified
locally. Other proposed view/frame/spectrum/overlay relations remain planned. No prior DB was reset.

31 October: additive `cosmic_0003` adds `source_products` (content-hash key + original/normalized JSON)
and `discovery_snapshots` (UUID, indexed canonical query hash/retrieval time, frozen JSON payload).
The implemented native/HTTPS repositories insert immutable records atomically. Discovery product
hash IDs are separate from the legacy `observations` UUIDs; no existing analysis FK is rewritten.
Snapshot payloads retain ordered selected products, alternate version IDs, receipts, availability and
TTL metadata. Raw FITS and raw XML bodies are not DB columns. See [discovery](discovery.md).

## Existing tables and reuse

| Existing table | Reuse / migration direction |
| --- | --- |
| observations | Immutable source/product/release metadata; enrich footprint/time/local response and source snapshot lineage |
| analysis_runs | Reuse durable execution infrastructure with typed job kinds, or add a processing_jobs parent; decide before implementing views |
| analysis_inputs | Retain old analysis ordering; frame-level contributors need their own relation |
| stage_executions | Reuse stage attempts/metrics with versioned viewer stage names |
| artifacts | Extend parent relations for views/frames/spectra/overlays; bytes remain in object storage |
| processing_jobs (cosmic_0002) | Implemented persistence primitives for typed work, scoped idempotency, leases/tokens/deadlines and completion; no public processing route/executor yet |
| model_versions, candidates | Optional inference only; not parents of ordinary views/frames |

Avoid a rewrite of the initial migration or destructive renames. Existing AnalysisRequest/model/candidate
fields are not a reason to make every movie depend on an analysis/ranker result.

## Planned relations by feature

| Feature / proposed relation | Required identity/data |
| --- | --- |
| releases / source_releases | Provider, collection (wide/deep), processing format, adapter version, active state, last checked and attribution |
| releases / source_snapshots | Query parameters, raw response checksum/object reference, retrieval UTC, INFO status/count/overflow/completeness and registry version |
| targets / target_presets | Five target keys, canonical/alias IDs, supplied versus catalog positions, coordinate reference epoch/frame, pm/error/provenance and validation state |
| observations enrichment | Source release/product identity, physical exposure identity, detector, observed intervals/scale/original strings, footprint, local-response metadata, safe links and calibration |
| views / sky_views | Canonical request/hash, region/FOV/dates/band/time-group choices, publication state, snapshot/config versions, data outcome and job/result link |
| views / view_frames | View FK + stable ordinal, actual time-bin bounds/midpoint semantics, grid/WCS/stretch, units/spectral support/quality and preview/science/mask/variance artifacts |
| views / frame_inputs | Frame FK + observation FK + unique ordinal, contribution/weight/exclusion reason and effective response; many-to-many, not one product per frame |
| bands / band_definitions | Versioned nominal channel/detector/range/response references; separate actual local input coverage |
| coadds / derived_products | Operation kind, selected frame/input relations, weights/response/time span, eligibility report and output artifact IDs |
| spectra / spectra + spectral_samples | View/coordinate/aperture/per-epoch position and method/config; wavelength/flux/error/unit/upper-limit/flags/response and contributing IDs |
| overlays / overlay_snapshots | Provider/release/query/epoch, source IDs/positions/pm/error, response hash, supported propagation model and generated layer references |
| jobs / processing execution | Typed request, creator/cancel capability digest, idempotency scope/hash, state/lease/attempt/deadline, sanitized failure, output/publication relations |

Shared infrastructure may consolidate physical job/result tables; feature ownership and typed contracts
remain explicit. Set concrete names/constraints at each migration; this is not an installed schema.

## Identity, chronology and provenance

- Product identity includes provider, collection, release and processing/product version. Separately
  identify the physical exposure to avoid showing QR2 and its QR3 reprocessing as different epochs.
  Do not merge different products solely on an unqualified obs_id.
- Keep observing start/end/time scale/original MJD/ISO precision. Midpoints/bin centers are computed
  and labeled; acquisition, processing, retrieval and publication dates are different columns.
- PostgreSQL timestamptz handles representable UTC instants; retain original scientific times for
  precision, leap seconds and unsupported conversions. No unknown scale is silently set to UTC.
- Sky coordinates use explicit ICRS degrees. Reference epoch/proper motion and apparent observer
  position are separate from coordinate frame/equinox. Keep unknown epochs null with a reason.
- Each frame records all contributors, spectral support/weights, effective exposure/time range,
  calibration/PSF/ePSF references, masks, grid and transforms. A composite is not a single native exposure.
- Shared display parameters belong to a versioned view; per-frame overrides are explicit. Preview
  pixels never replace calibrated arrays or source metadata.

## Integrity, API publication and caching

Use FKs/uniqueness for view ordinals and contributor identities. Validate finite scientific values,
nonnegative byte counts/variance, known units and eligible operation state in typed schemas/services;
do not encode unavailable measurements as zero. Distinguish no_data/single_epoch/ready_for_animation
from queued/running/failed execution states. Known incomplete discovery has an unknown total.

Publish only a complete immutable manifest referencing validated artifacts. Cache keys include source
snapshot/product/calibration, region/FOV, spectral/time bin, masks, grid, photometry/display and code/config
versions. Refresh creates a new view generation; an old shared ID keeps its original manifest.
Frame/input provenance makes loss of epochs or hidden resampling detectable.

Files (FITS, previews, maps, CSV, movies, optional weights) are stored outside PostgreSQL with generated
keys, SHA-256, bytes/type, owner relations and visibility/retention metadata. Public readers use IDs or
scoped URLs, not arbitrary paths. Private job cancellation tokens are hashed and absent from share URLs.

Production repository transports must preserve DB constraints and atomic job functions. If HF egress
requires an HTTPS gateway, use transactional RPCs for multi-table acceptance/claim/publication, not a
sequence of independent REST writes. Alembic/native workers run in a DB-reachable environment.

Keep raw/derived caches bounded; retain curated target manifests/artifacts for the release and document
the selected temporary retention period before enabling cleanup. Backups/restore cover DB and object
versions together. No cleanup/reset is performed by this planning update.

## Implemented step-3 relations: cosmic_0004

`sky_views` links input jobs to frozen snapshots, creator/cancel scope, canonical selection/cache and
expiry. `view_submissions` persists scoped idempotency and client/IP admission history. `view_input_pins`
retains byte hashes across retries. `view_files` records upload intent before object PUT, then becomes
a fenced publication registry. Unpublished failed-attempt objects remain invisible and cleanup-eligible.
Initial artifacts/observations/analysis FKs are preserved. PostgreSQL serializes quotas/leases/publication
for both transports. [View/storage semantics](views.md); frame/spectrum/overlay relations remain future.

## Step 4 implementation update

[view-v2 frame preparation](frame_preparation.md) now uses release-aware readers, strict masks,
fixed-grid reprojection/marginal variance, independent-reference residual checks, nominal/local-band
context, explicit bins and shared/per-frame previews. Additive cosmic_0005 adds prepared_frame_sets
and prepared_artifacts with fenced atomic raw/derived publication and bounded merged cleanup.
Existing v1 jobs are preserved. API and native worker images include SciPy/Pillow; the official
R7 catalog is packaged with source member hashes. Step 5 now adds [frozen movie delivery](movie_delivery.md) and a locally verified React/Aladin handoff.
Quantitative operations, cloud deployment and scientific target-recovery sign-off remain later gates.

## Step 5 persistence: cosmic_0006

`movie_manifests` holds one immutable JSON payload and canonical SHA-256 per sky view. First successful
read materializes it only from the committed preparation of a succeeded, unexpired view; first insert
wins in both native SQL and the authenticated HTTPS gateway. Frames are bounded JSON entries with
stable UUIDs and ordinals rather than independently mutable rows. No schema reset or source rewrite
occurs. Retention hides expired metadata/artifacts; existing bounded file cleanup is unchanged.
