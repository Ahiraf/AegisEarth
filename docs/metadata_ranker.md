# Optional researcher ranker v2 integration

Updated 8 November 2026. Product name: **AegisEarth**. This is the researcher's
`ranker_AB_v3` logistic ensemble, not a newly trained backend CNN. Its unmodified
package, model card, manifest and 13 golden cases are in
[`backend/model_packages/aegis_ranker_v2`](../backend/model_packages/aegis_ranker_v2/INTEGRATION.md).
Training and scientific evaluation remain the researcher's responsibility.

## Enable and operate

The ranker is **off by default**. The API and worker need the same package/model and
`METADATA_RANKER_ENABLED=true`. Install optional candidate-discovery dependencies:

```powershell
cd backend
.\.venv\Scripts\python -m pip install -e '.[ranking]'
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\python -m app.modules.views.worker
```

Build either Dockerfile from the repository root with
`--build-arg INSTALL_METADATA_RANKER=true`. In `compose.yaml`, set
`INSTALL_METADATA_RANKER=true` and `METADATA_RANKER_ENABLED=true` before
`docker compose up --build`; both API and worker receive the opt-in settings.
Keep the API and continuous worker on
hosts supporting their existing PostgreSQL lease/storage protocol. A browser or a
short HTTP request must never perform these downloads or SkyBoT queries.
`METADATA_RANKER_WALL_SECONDS=600` (120–900) and
`METADATA_RANKER_MAX_CANDIDATES=24` (1–32) bound work. Existing memory, CPU, input-byte,
queue, client and IP quotas also apply. Set `PUBLIC_TOKEN_SECRET` as for viewer jobs;
the API and worker share PostgreSQL and local/S3 object storage. Never expose secrets
in React environment variables.

## Runtime API

1. Use `POST /api/v1/observations/search` with `discovery-v1` to obtain an immutable
   `snapshot_id` for an ordinary sky field. Check sampling/truncation warnings;
   narrow dates if necessary. A search page can contain fewer items than its snapshot.
2. Explicitly opt into inference using a fresh UUID `Idempotency-Key` header and the
   same anonymous session/cookie used for viewer requests:

```json
{
  "contract_version": "metadata-ranker-v1",
  "method": "metadata_ranker",
  "snapshot_id": "<discovery snapshot UUID>",
  "visit_index": 0,
  "max_exposures": 12
}
```

`POST /api/v1/analyses` returns 202 for a new queued job, or 200 for an idempotent/cache
replay. The response includes `id`, `method`, `status_url`, `result_url`, `cache_hit`
and a creator-only `cancel_token`. Poll `GET /api/v1/analyses/{id}`: queued/running
returns 202 with `Retry-After: 3`; terminal status returns 200 with `status`,
`error_code`, expiry and `result`. Inspect status rather than treating HTTP 200 as
successful scientific inference. Creator cancellation uses the existing
`POST /api/v1/views/{id}/cancel` with `Authorization: Bearer <cancel_token>`.

Disabled/missing dependencies: 503 `metadata_ranker_unavailable`. Too few frames,
invalid visit or a preset field: 422. Missing snapshot: 404. Existing quota and
idempotency conflicts remain 429/409. The older observation-ID `AnalysisRequest`
still returns 503; it does not silently invoke this different scientific contract.
`GET /api/v1/system/capabilities` advertises `metadata_ranker_available`, method and
contract. Capability availability does not guarantee an external service is online.

## Worker steps

The user's corrected training contract supersedes the shared-search-centre advice
in the vendored `INTEGRATION.md`. **No package file has been modified.** The worker
uses `per_candidate_centered_v1`; jobs created with the former policy must be
resubmitted. Apply migration `cosmic_0010` before running the updated API/worker.

1. Collapse simultaneous detector products into physical exposures. Choose 6–12
   chronological exposure midpoints spread across one visit, splitting gaps greater
   than 12 hours. Retain the complete immutable discovery snapshot for subsequent
   detector selection. Reject all five preset fields as before.
2. Call the unmodified `candidates.find_candidates(frames, radius_deg=0.18)` inside
   the isolated asynchronous job, **before downloading any cutouts**. Search frames
   contain the search coordinates and `(t_min+t_max)/2` in MJD UTC; SkyBoT location
   remains geocentric `500`.
3. Split by `model['v_range'][1]` (18.1 for this model). Fainter objects get no
   downloads and no `rank` call: store null score/uncertainty, `uncertain`, and only
   `PREDICTED_FAINTER_THAN_TRAINING_RANGE`. Their middle predicted position and all
   SkyBoT positions/MJDs remain in evidence, without product IDs. Missing/nonfinite
   magnitudes are also retained unscored with a separate backend warning.
4. Process eligible candidates brightest first. `METADATA_RANKER_MAX_CANDIDATES`
   applies to this bright list only; retain over-limit objects unscored. For each
   candidate exposure, join its prediction to the exposure mid-MJD and choose one
   detector whose footprint contains the point. Prefer covering snapshot products;
   otherwise use bounded IRSA ObsCore TAP with
   `CONTAINS(POINT('ICRS', ra, dec),s_region)=1 AND t_min<=mid_mjd AND t_max>=mid_mjd`.
   Keep the same exposure identity and collection; skip an uncovered exposure.
   Multiple detector products never count as multiple frames for one exposure.
5. Fetch native **15 arcmin cutouts centred on that candidate's prediction at each
   exposure**. Initially request up to eight spread exposures; fetch remaining
   exposures, up to twelve total, only if fewer than four pass package QC and time
   remains. Use three parallel downloads, FITS/identity/size/hash checks, and the
   existing unexpired exact-product/URL cache. The URL includes centre and size.
   Durable upload records pin each acquisition key separately, allowing different
   centres on one product. Viewer product-only pins are unchanged.
6. Submit chronological `dict(path, ra, dec, mjd)` frames to the unmodified
   `features.rank(..., v_mag=..., version=<normalized l2b-vNN>)`. Keep package QC,
   its spread selection, thresholds, classifications and all warning messages.
   Additional per-frame diagnostics use `features.analyze_frame`, not viewer masks.
   Prepared/resampled FITS and `snr_proxy` stay out of inference.
7. Reserve 15 seconds of the configured wall budget for upload/report publication;
   stop scheduling I/O when the working deadline is reached. Download requests
   honour the remaining deadline. Retain unprocessed bright objects with
   `BACKEND_WALL_TIME_LIMIT_REACHED`; the report adds `CANDIDATE_LIMIT_REACHED` for
   either wall-time or bright-candidate limits. Publish candidates, model identity,
   actual acquired files and terminal status in one lease-fenced transaction.
   Cancellation, lease loss or invalid artifacts cannot publish a partial run.

SkyBoT/service or scoring failures affect only this optional job. They never mutate
movie, spectrum or context results. Successful results and inputs retain the
existing 24-hour expiry. A successful response is not a scientific accuracy claim.

The containing-product query follows the official
[IRSA native-cutout tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/),
with the backend's existing ObsCore metadata normalization and bounded transport.

## Candidate mapping and UI handoff

| Backend field | Source / meaning |
| --- | --- |
| `method` | `metadata_ranker` in acceptance, report, model and candidate evidence |
| `classification` | Exactly `classification_hint`: `possible_motion` or `uncertain` |
| `score`, `score_kind` | Package score or null; always `candidate_score`, **uncalibrated rank, never probability or percentage** |
| `score_uncertainty` | Package `uncertainty` or null: standard deviation across 50 models, not a confidence interval |
| `ra_deg`, `dec_deg` | Predicted position at the middle used frame; middle available frame if unscored |
| `displacement_arcsec` | Package displacement or null |
| `model_version_id` | `ranker_AB_v3`, referencing the model registry and immutable weights SHA-256 |
| `warnings` | Optional nullable candidate-table JSON array; populated with package codes for this method |
| `evidence` | Explanation codes, feature evidence, span, number/IDs of used frames, plain warning messages, predicted per-frame positions, UTC MJD, detector and native spectral metadata |

The result contains `model`, `visit`, `candidate_source`, `candidate_count`,
`candidates`, `warnings` and `outcome`, plus additive acquisition counts and timing.
`evidence.cutout_policy` is `per_candidate_centered_v1`. Downloaded frame evidence
records the actual product ID, SHA-256, cutout centre/size, detector, mid-MJD,
`used_for_score`, QC diagnostics and reasons for non-use. Non-downloaded predictions
have no product ID. Usable frames beyond the package's spread selection say
`USABLE_NOT_SELECTED_BY_RANKER`; other reasons distinguish edge, QC, aperture,
archive/coverage failures, time limits and unrequested extra frames.
Native spectral proxies refer to the **candidate prediction at that exposure**,
not calibrated candidate spectroscopy. Temporary local paths never appear publicly.

Only the **5% false-alert operating threshold, 0.2951**, is validated by the supplied
package. Classification is taken directly from its hint, including its faint-source
cap above V=18.1. A score above the threshold is not a 95% discovery probability.
Preserve `meets_10pct_threshold` only as **informational**; never use it for labels.
Render `evidence.warning_messages`, including the supplied crowded-field caveat when
`possible_motion` coexists with `APERTURE_ON_CATALOG_SOURCE`. Show null scores as
“unable to score” alongside the warnings, never as zero. A successful query with no
known candidates is not evidence that the sky contains no moving/variable sources.

Production React offers explicit optional submission after discovery and loading an
existing analysis UUID. It shows bright objects in magnitude order and collapses
faint objects under “Known objects too faint for this ranker (N)”. Disabled/service
failure states leave the sky viewer usable. Faint null scores appear as unscored.

## Verification

All 58 manifest entries were SHA-256 verified. All 13 supplied cases printed **OK**
locally and in the Docker image, using Python 3.12, NumPy 2.5.4 and Astropy 8.0.2.
These runtime versions differ from the researcher's reference pins; the golden
tolerance of 1e-6 passed. The source/model bytes remain unchanged.

```powershell
cd backend/model_packages/aegis_ranker_v2
..\..\.venv\Scripts\python golden/check_golden.py ranker_AB_v3.json
```

The full backend suite passes **194 tests**. Candidate-centred tests cover large
motion across the field with real native golden pixels, zero downloads/rank calls
for faint predictions, one detector per exposure, compact/full snapshot metadata,
IRSA fallback predicates, adaptive 8-to-12 acquisition, and clean wall-stop
publication. Two database ledger tests cover atomic unscored publication at the
deadline and independently pinned/cacheable centres on the same product. Viewer
isolation, preset exclusions and all original golden mapping checks still pass.

## Corrected live acceptance

The real QR2 run at RA 179.88°, Dec -0.64°, 21-23 December 2025 used 12 physical
exposure epochs spanning 27.821 hours. It completed in **115.500 s total**, with
**113.594 s** in the worker. It acquired **8 native candidate-centred cutouts**
(43,197,120 bytes), using **9 HTTP download attempts including one retry**, with
no cache hits. The `acquisition.cutout_downloads` field counts attempts; use
`input_count` minus `cache_hits` for successful new cutouts.

**Massalia:** predicted V=10.870; package `n_frames_used=8` (all eight passed QC);
its unchanged spread rule selected six for scoring. Rank 0.9999999563144074,
ensemble spread 1.0703322865878004e-7, hint `possible_motion`. This rank is not a
probability or a discovery confirmation. No edge, failed-QC or unmeasurable-aperture
exclusions occurred. Two usable frames were omitted by the package spread rule;
one further predicted exposure was not downloaded because enough usable frames
already existed. Every frame, actual product, centre, hash and non-use reason is
in the evidence.

SkyBoT returned **39** candidates. All **38 faint objects** were retained with
null scores/uncertainties, `uncertain`, the required faint warning, predicted
positions and **no downloaded products**. They include all **23** faint objects in
the earlier capped result; 15 additional faint objects are now retained because
the cap applies only to bright candidates. All 39 candidate rows were persisted.

- [Full new result JSON](verification/metadata_ranker_candidate_centered_live_result.json)
- [Wall time, worker and database report](verification/metadata_ranker_candidate_centered_live.json)
- [Per-frame readable report](verification/metadata_ranker_candidate_centered.md)
- [Acceptance audit](verification/metadata_ranker_candidate_centered_acceptance.json)
- [Backend test results](verification/metadata_ranker_candidate_tests.xml)

The earlier [shared-centre result](verification/metadata_ranker_result.json) is
retained only for comparison and is superseded by this policy. An initial transient
IRSA discovery outage and the backend compact-metadata ledger rejection found and
fixed during this work are retained in the adjacent initial/fenced/immutable-conflict
reports. Neither required changes to package code, weights, thresholds or QC.

Reproduce with `scripts/verify_metadata_ranker_live.py`, a disposable localhost
PostgreSQL database with `test` in its name, migrations at head, explicit ranker
enablement and local storage. Use `--ra 179.88 --dec -0.64 --start
2025-12-21T00:00:00Z --end 2025-12-23T00:00:00Z --collection spherex_qr2 --output
docs/verification/metadata_ranker_candidate_centered_live.json`. Regenerate the
acceptance summary with `scripts/summarize_ranker_acceptance.py` after retaining
that report and the backend JUnit receipt. The script never substitutes fixtures
when an external service is unavailable.

Production deployment/migration and researcher scientific/licensing approval
remain separate. No cloud deployment was performed in this change.
