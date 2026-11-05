# REST contract and React handoff

Revision: 2 November 2026. Base `/api/v1`.
**Only existing routes in [openapi.json](openapi.json) are runtime contracts.** Step 2 discovery is
implemented; step-3 view input acquisition is also implemented. Step 4 view-v2 frame/band preparation is also implemented; step-5 movie delivery is implemented and locally verified, and steps 7–8 derived jobs are implemented with explicit science-grade gates. See [movie-v1 handoff](movie_delivery.md). See [discovery](discovery.md)
for the full React handoff, limits, cache semantics and [working request](examples/discovery_search.json).

## Current scaffold

| Route | Actual state |
| --- | --- |
| GET `/health/live`, `/health/ready`, `/system/capabilities` | Health and capabilities, including `view_limits.total_bytes` and `view_limits.wall_seconds` for pre-submission feedback |
| GET `/targets` | Implemented five-target curated catalog snapshot with source epochs/provenance; not live discovery |
| POST `/targets/resolve`, GET `/releases` | Coordinate normalization and versioned enabled collections |
| POST `/observations/search` | discovery-v1 implemented; old radius contract explicitly retired with 410 |
| GET `/observations/snapshots/{id}`, GET `/observations/{id}` | Immutable paged search results and original product metadata |
| POST `/views`, GET `/views/{id}`, `/jobs/{id}`, POST `/views/{id}/cancel` | Implemented durable inputs_ready flow; [active contract](views.md) |
| GET `/artifacts/{id}`, `/artifacts/{id}/content` | Committed input metadata and verified FITS bytes |
| POST `/views` with view-v2; GET `/views/{id}/preparation`, `/views/{id}/bands` | Implemented prepared-frame report/local band context; [active contract](frame_preparation.md) |
| GET `/views/{id}/manifest`, `/views/{id}/frames`, `/views/{id}/frames/{ordinal}/coordinates` | Implemented frozen movie-v1 summaries/pages, time/WCS/provenance and coordinate mapping |
| GET `/artifacts/{id}/science.fits` | Implemented primary 2D FITS delivery for Aladin v3 |
| GET `/views/{id}/coadds/options`; POST `/views/{id}/coadds`, `/views/{id}/differences`, `/views/{id}/spectra`; GET `/coadds/{id}`, `/differences/{id}`, `/spectra/{id}` | Implemented bounded derived-v1 jobs and exports; [contract and science limits](derived_operations.md) |
| POST `/comparisons/validate` | Implemented strict signed-difference eligibility/reasons |
| GET `/views/{id}/overlays/catalogs`, `/views/{id}/overlays/wise/{band}` | Implemented Gaia/WISE context, PNG/FITS/WCS/epoch/provenance; provider failures isolated |
| POST `/share/links`; GET `/share/resolve`, `/views/{id}/links`, `/share/viewer`, `/share/embed/{id}` | Implemented versioned restore, frozen expiry and backend reference embedding |
| POST `/views/{id}/refresh`, `/releases/refresh`; GET `/releases/refresh-status` | Implemented bounded, fenced metadata refresh and explicit immutable rebuild |
| GET `/views/{id}/export-metadata`; POST `/views/{id}/exports`; GET `/exports/{id}` | Implemented JSON/CSV and durable captioned GIF/provenance exports |
| GET `/bands`, `/bands/{id}` | Official nominal channels and representative curves |
| POST `/analyses` | Strict legacy pair/sequence schema validated, then 503 feature_not_ready |

Use [discovery_search.json](examples/discovery_search.json) for active discovery. The previous
[observation_search.json](examples/observation_search.json) illustrates the retired legacy radius body.
[analysis_request.json](examples/analysis_request.json) remains a schema example, not a queued job.
Legacy analyses require 2–6 IDs, ≤5′ cutout and a ranking_method, but execution remains disabled.
The planned view body below is not accepted by discovery or analyses.

## Planned endpoints by feature

| Method / path | Target behavior | Plan |
| --- | --- | --- |
| GET `/targets` | Curated catalog implemented; live availability enrichment remains planned | 1–2 |
| POST `/targets/resolve` | Implemented coordinate normalization; no live name lookup | 2 |
| GET `/releases` | Implemented enabled collections/formats/review/citations; scheduler remains future | 2, 10 |
| POST `/observations/search` | Implemented discovery-v1 FOV/time/collection/band with explicit sample completeness | 2 |
| GET `/observations/{id}`, `/observations/snapshots/{id}` | Implemented immutable source metadata and deterministic sample pages | 2 |
| POST `/views` | Implemented view-v1 inputs and view-v2 preparation; movie-v1 delivery implemented | 3–5 |
| GET `/views/{id}` | Implemented input-job state/canonical selection/artifacts; manifest URL and separate movie readiness | 5 |
| GET `/views/{id}/manifest` | Implemented frozen movie-v1 ordered frame manifest | 5 |
| GET `/views/{id}/frames` | Implemented stable frame pagination, metadata and artifacts | 5 |
| POST `/views/{id}/cancel` | Implemented creator capability cancellation with worker fencing | 3 |
| GET `/views/{id}/bands` | 102 nominal-channel definitions plus actual local coverage/detectors | 4 |
| POST `/comparisons/validate` | Operation-specific display/difference/coadd/photometry eligibility and reasons | 4, 7 |
| POST `/views/{id}/coadds`, `/views/{id}/differences` | Explicit input groups → bounded processing jobs | 7 |
| POST `/views/{id}/spectra` | Coordinate/aperture/epoch extraction → bounded spectrum job | 8 |
| GET `/spectra/{id}` | Wavelength/flux/errors/flags/gaps/method/source evidence + CSV link | 8 |
| GET `/views/{id}/overlays` | Bounded Gaia/WISE request/status with epoch-aware layer data | 9 |
| GET `/artifacts/{id}` | Implemented raw/prepared FITS, PNG/JSON metadata and verified /content | 3, 5 |
| POST `/views/{id}/exports` | Bounded optional movie/export job; regular playback uses frames | 10 |
| GET `/jobs/{id}` | Implemented view input jobs; derivative kinds remain future | 3, 7–10 |
| POST `/admin/releases/refresh` | Authenticated, bounded source refresh | 10 |
| POST `/views/{id}/suggestions` | Optional approved researcher predictor, disabled until integrated | 12 |

Each route needs its Pydantic models, migration/repository/service, auth/quotas and OpenAPI/tests at
implementation. Do not invent new implemented capabilities by listing them here.

## Planned full-view request (future contract extension)

```json
{
  "contract_version": "view-v1",
  "region": {"ra_deg": 133.7951291667, "dec_deg": -7.2451472222, "fov_arcmin": 5},
  "time_window": null,
  "release_policy": "prefer_latest_consistent",
  "spectral_selection": {"mode": "common_available", "detector": null, "channel_id": null},
  "temporal_grouping": {"mode": "native_epochs"},
  "max_frames": 60,
  "display": {"grid": "sky_fixed", "stretch": "shared_asinh"}
}
```

The active step-4 body is [prepared_view_request.json](examples/prepared_view_request.json), with [frame/band semantics](frame_preparation.md).
The preserved step-3 body is [view_request.json](examples/view_request.json), documented in [views.md](views.md).
Display/grouping fields in this future example are not accepted by the current strict schema.

This uses the brief's WISE 0855 seed converted to degrees, with no assumed astrometric epoch and
no availability claim. `time_window=null` means discover source availability within documented
service limits; it does not silently search only two predefined dates. `common_available` selects
supported common local wavelengths, or returns choices/limits; it is not permission to blend all bands.
Choose how new schemas coexist with legacy clients before implementation, and version that decision.

A new job returns 202 only after durable acceptance, with ID/status URL/Location and any cancel token
returned privately to the creator. An Idempotency-Key plus same normalized body reuses work; conflicting
reuse returns 409. A cache hit may return 200 with a published view. Admin keys never enter React.

## Manifest requirements (movie-v1 implemented in step 5)

| Field group | Required semantics |
| --- | --- |
| Identity | view_id, manifest_version, frozen source snapshot and processing/config versions |
| Requested/actual region | Normalized RA/Dec/FOV plus actual common coverage; no hidden cropping |
| Outcome | no_data / single_epoch / ready_for_animation, distinct from processing state |
| Time | Stable ordinal, UTC interval/midpoint, original scale/string precision, real gaps, contributors/time-bin bounds |
| Spectral | Detector/channel/local center/width/response, nominal vs available coverage, composite weights |
| Image | Preview/artifact IDs, dimensions, sky-fixed WCS/projection/origin/orientation, masks/grid/stretch policy |
| Quality | Decoded flags, usable coverage, registration support/uncertainty, eligibility by operation, safe warnings |
| Provenance | Product/release/calibration IDs, checksums, observation versus processing/retrieval dates, acknowledgements |
| Related results | Optional coadd/difference/spectrum/overlay/suggestion links; core manifest has no mandatory model field |

Frame timestamps are observational, not animation FPS. Equal playback intervals must not suggest uniform
physical cadence. Use distinct masks for uncovered pixels; never render missing coverage as measured zero.
Shared intensity scaling is the default for brightness comparison; alternative stretches are labeled.

Collections use deterministic `{items,total,limit,offset}` when a complete total is known. Also expose
`upstream_complete`, `returned_count`, `total=null` when unknown and a continuation/cursor where supported.
An OVERFLOW sample cannot claim total=returned_count. Long source lists/frames must be paginated/batched.

## Errors, public access and capabilities

404 unknown resource; 422 invalid/ambiguous input; 409 incompatible operation/idempotency conflict;
429 quota; 503 disabled/upstream capability. Empty source coverage and single-epoch outcomes are
successful data states where discovery itself succeeded. Partial discovery is labeled, not concealed.
Implemented discovery errors use FastAPI's `{"detail":{"code":"..."}}` envelope, with Retry-After
for provider/concurrency failures; schema errors use the standard 422 validation details. Legacy
radius search returns 410 `legacy_search_retired` with replacement `discovery-v1`.
Job status can be retrieved even when processing failed, with safe reason/evidence; never publish partial
science as a complete result. Optional operation/provider failure leaves original frames retrievable.

Public reads and bounded anonymous viewing are planned. Server-side limits include normalized cache
reuse, per-client/global quotas, time/byte/frame caps and cancel ownership. Admin refresh/bulk work uses
protected server-side credentials. No BFF or shared browser secret is required for the ordinary visitor.
Capabilities must distinguish native display, comparable movie, coadd, difference, spectrum, Gaia, WISE
and optional inference with actual availability/limits; schema presence alone never enables a feature.

## Frontend URL and embedding contract (planned)

Coordinate link shape, using a placeholder frontend origin:

```text
<frontend-origin>/explore?v=1&ra=133.7951291667&dec=-7.2451472222&fov=5&band=common&mode=movie
<frontend-origin>/v/<published-view-id>
<frontend-origin>/embed/<published-view-id>
```

Include optional dates/detector/channel with explicit units. Coordinate URLs restore choices and may
discover newer data; immutable view-ID URLs reproduce the frozen products/config. Neither carries
credentials or cancel tokens. React parses/restores UI and implements embedding; backend normalizes/
validates state and serves public manifests/artifacts. Agree frontend framing/CSP `frame-ancestors`,
API CORS and artifact origins/cache policy; verify a real iframe from another site.

React owns playback/loop/speed/scrub/step, keyboard/reduced-motion support, metadata/flag inspector,
Aladin/overlay presentation and spectrum graphs. Backend owns data/units/WCS/transforms/source
provenance/operation eligibility and jobs. Reprojected FITS and tested WCS/pixel mappings support
Aladin; pre-rendered previews support lightweight animation without full FITS transfer per frame.

Existing OpenAPI export remains generated by `python scripts/export_openapi.py`; update snapshots
and machine-readable **runtime** examples only when the corresponding routes are implemented.

See [step 9–10 methods, limits and frontend integration](context_sharing.md) for current runtime contracts.
