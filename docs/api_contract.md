# REST contract and frontend handoff

Base path `/api/v1`. Live OpenAPI: `/docs`, `/openapi.json`. Frontend implementation is maintained
separately by its owner under `frontend/`. Only endpoints marked implemented/scaffold exist;
planned routes are design contracts.
The [OpenAPI snapshot](openapi.json) is generated from the actual app; regenerate it with
`python scripts/export_openapi.py` from root using the backend environment. Machine-readable request
examples are in [analysis_request.json](examples/analysis_request.json) and
[observation_search.json](examples/observation_search.json). Their IDs/coordinates are schema examples,
not verified real data or queued jobs.

## Endpoint inventory

| Method / path | Purpose | Current state |
| --- | --- | --- |
| GET `/health/live` | API liveness | Implemented |
| GET `/health/ready` | Database/schema checks; separate pipeline status | Implemented |
| GET `/system/capabilities` | Service/pipeline availability | Implemented |
| POST `/observations/search` | Bounded cone/time discovery | Validation implemented; 503 until adapter exists |
| GET `/observations/{id}` | Persisted observation/provenance | Planned |
| POST `/comparisons/validate` | Compatibility report | Planned |
| POST `/analyses` | Durable processing job | Validation implemented; 503 until execution exists |
| GET `/analyses/{id}` | Status, current stage and completed-result manifest | Planned |
| POST `/analyses/{id}/cancel` | Protected cancellation | Planned |
| GET `/analyses/{id}/candidates` | Paginated completed candidates | Planned |
| GET `/candidates/{id}` | Evidence/detail | Planned |
| GET `/artifacts/{id}` | Published safe preview/download reference | Planned |
| GET `/models` | Enabled ranker versions/model-card references | Planned |

## Current request examples

Observation search (coordinates in ICRS degrees; interval explicitly UTC):

```json
{
  "region": {"ra_deg": 127.69444, "dec_deg": -39.1776, "radius_deg": 0.01},
  "start_at": "2025-05-01T00:00:00Z",
  "end_at": "2025-11-01T00:00:00Z",
  "collection": "spherex_qr3",
  "limit": 20
}
```

This is a schema example, not a claim that images are available for these parameters.
Implementing the adapter includes an explicit conversion to the provider's time/coordinate convention.

Analysis submission (IDs below are placeholders, not real provider products):

```json
{
  "observation_ids": ["local-observation-1", "local-observation-2"],
  "mode": "pair",
  "center_ra_deg": 127.69444,
  "center_dec_deg": -39.1776,
  "cutout_size_arcmin": 2,
  "max_pixels": 256,
  "ranking_method": "classical"
}
```

Current response to a valid request is 503 `feature_not_ready`; invalid bodies return FastAPI's 422
validation response. Pair mode requires exactly two distinct IDs. Sequence mode requires 3–6 and is a
planned capability; a valid schema is not proof the selected mode/ranker is enabled. Unknown body fields
are rejected, including arbitrary URLs. All non-finite coordinates and out-of-bounds inputs are rejected.

## Target asynchronous behavior

After execution is implemented, valid protected submission returns 202 with `{id,status,status_url}` and
an appropriate Location header. An Idempotency-Key identifies the request: repeated same body returns
the same run, incompatible reuse returns 409. Validation failure is 422, incompatible science is 409/422
with a documented compatibility report, unavailable capability/dependency is 503, quota is 429.
Unknown resources return 404; failed jobs are retrieved successfully with status=failed and a safe error.

The selected ranker/mode must be enabled before accepting the job. Use GET capabilities to build controls.
Do not claim all algorithm choices are available merely because the request schema lists them.

Target job response:

```json
{
  "id": "example-run-id",
  "status": "running",
  "current_stage": "register",
  "pipeline_version": "versioned-release",
  "completed_stages": ["validate_compatibility", "acquire_cutouts", "inspect_and_mask"],
  "result": null,
  "error": null
}
```

This is a future contract example. Stage completion is more honest than inventing precise percentage/ETA.
Collections use deterministic pagination `{items,total,limit,offset}`. Cancellation is cooperative; an API
request is not a promise that an active native operation stops instantly.

## Score and evidence semantics

- `candidate_score` is an uncalibrated ranking value in [0,1], not a probability or confirmation.
- `calibrated_probability` requires a model/calibration reference and evaluation against relevant held-out data.
  A schema accepting the label is not independent evidence that a model is calibrated.
- Candidate classifications: `possible_motion`, `brightness_change`, `artifact`, `uncertain`.
- Return original/aligned/difference evidence references, epoch/scale, local wavelength, QC warnings,
  model/pipeline versions and source attribution. Keep no-candidate success distinct from failure.
- Two-epoch displacement may be uncertain. Never describe a ranking score as chance of impact or Planet X discovery.

## Frontend/backend boundary

Frontend owns the viewer, blink/slider/side-by-side, navigation, accessible descriptions and overlay rendering.
Backend owns compatible-image selection, science transforms, results/provenance and pixel/sky coordinates.
The result manifest must state image dimensions, origin convention, celestial WCS or tested overlay transform,
orientation, timestamps, display stretch and artifact URLs. A displayed PNG is not the original science array.

Protect expensive submission with a server-side demo/service credential and bounded quotas before enabling it.
If the public frontend needs on-demand submission, its server/BFF must proxy that credential; never bundle
a shared secret in React. Public viewers may read curated precomputed runs without private submission access.
Any anonymous on-demand submission is a later explicit quota/abuse-control decision.

Current CORS permits configurable origins and GET/POST. Root API does not host a React app. Frontend CI,
containers and deployment are managed separately by its owner.
