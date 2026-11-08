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

1. Take one processing choice per exposure/detector product. Sort chronologically,
   split at gaps **greater than 12 hours**, and spread 6–12 native frame selections
   across the chosen visit. `visit_index` is zero-based across all sorted visits,
   including visits with too few frames. Simultaneous detector images keep their
   shared epoch and distinct product identities, as in the supplied goldens; they
   are not additional independent time samples.
2. Reject search centres within 0.18° of any of the five preset targets at the visit
   bounds. This model is for moving candidates, not the preset stars/brown dwarfs.
3. In the leased worker's isolated child, fetch **15 arcmin native IRSA cutouts**
   centred on the search coordinates, using three parallel downloads. Reuse only
   hash-verified, unexpired exact-URL/product cached inputs. Validate FITS structure,
   identity, dimensions and bytes; pin hashes and upload through the existing ledger.
   Prepared/resampled viewer frames and `snr_proxy` never enter this model.
4. Call the unmodified `candidates.find_candidates(frames, radius_deg=0.18)` there.
   Epochs are `(t_min+t_max)/2` in MJD UTC, with geocentric SkyBoT location `500`.
   Results are **known solar-system object predictions**, not blind discoveries.
   Pass each object's per-frame predicted RA/Dec and V magnitude to `features.rank`.
   Normalize processing versions, e.g. `l2b-v27-2026-...` to `l2b-v27`.
5. Let the package's QC/selection keep up to six usable frames. Record nullable
   scores and warnings when fewer than four pass. Publish candidates, model
   provenance, job success and input artifacts in one lease-fenced transaction.
   Cancellation, lease loss or validation failure cannot publish a partial run.

SkyBoT/service or scoring failures affect only that optional job. They never mutate
an existing movie, spectrum or survey-context result. The ranker can be disabled
while viewer endpoints and workers continue. Successful results/input artifacts
share the existing 24-hour retention; expired analysis GET responses withhold results.

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
`candidates`, `warnings` and `outcome`. Native spectral metadata explicitly identifies
the wavelength at the **search centre**, not measured candidate spectroscopy.
Per-frame times are not altered when two detector images share an epoch. Local
temporary paths are replaced with immutable product IDs in public evidence.

Only the **5% false-alert operating threshold, 0.2951**, is validated by the supplied
package. Classification is taken directly from its hint, including its faint-source
cap above V=18.1. A score above the threshold is not a 95% discovery probability.
Preserve `meets_10pct_threshold` only as **informational**; never use it for labels.
Render `evidence.warning_messages`, including the supplied crowded-field caveat when
`possible_motion` coexists with `APERTURE_ON_CATALOG_SOURCE`. Show null scores as
“unable to score” alongside the warnings, never as zero. A successful query with no
known candidates is not evidence that the sky contains no moving/variable sources.

The production React ranker controls are a separate frontend handoff; this backend
integration does not alter the designer's UI or make inference a playback prerequisite.

## Verification

All 58 manifest entries were SHA-256 verified. All 13 supplied cases printed **OK**
locally and in the Docker image, using Python 3.12, NumPy 2.5.4 and Astropy 8.0.2.
These runtime versions differ from the researcher's reference pins; the golden
tolerance of 1e-6 passed. The source/model bytes remain unchanged.

```powershell
cd backend/model_packages/aegis_ranker_v2
..\..\.venv\Scripts\python golden/check_golden.py ranker_AB_v3.json
```

Tests in `backend/tests/test_metadata_ranker.py` cover package integrity, scientific
mapping, all five exclusions, visit selection, admission/idempotency, null outputs,
atomic candidate publication, lease fencing and cancellation against disposable
PostgreSQL. Live external acceptance is recorded separately in
[`verification/metadata_ranker_live.json`](verification/metadata_ranker_live.json).
The full backend regression suite passed **183 tests**. The real QR2 field at
RA 179.88°, Dec −0.64° on 21–23 December 2025 produced a successful job with 12
native 15′ cutouts and **24 persisted candidates** (candidate cap disclosed in the
result): 11 numeric scores, 13 warning-only outputs and all hints `uncertain`.
This is an integration check, not a recovered-object or accuracy claim. The
[standalone result JSON](verification/metadata_ranker_result.json) is ready to send
to the researcher. The earlier transient-download/local-install failure is retained
in [initial attempt evidence](verification/metadata_ranker_live_initial.json).
Reproduce it with `scripts/verify_metadata_ranker_live.py`, a localhost database with
`test` in its name, migrations at head, explicit ranker enablement and local artifact
storage. The script never substitutes fixtures when external data is unavailable.
For the accepted field, add `--ra 179.88 --dec -0.64 --start 2025-12-21T00:00:00Z
--end 2025-12-23T00:00:00Z --collection spherex_qr2`. A previous still-queued local
attempt can be resumed with `--resume <job-id>` and its existing report. Refresh an
existing editable installation with `pip install -e '.[ranking]'` after pulling the
new package layout; the worker subprocess must resolve `model_packages` outside
the backend working directory.
Researcher licensing/redistribution confirmation and scientific review remain
separate from passing integration tests.
