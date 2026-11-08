---
title: AegisEarth API
emoji: 🔭
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# AegisEarth

FastAPI backend for a public **SPHEREx sky time viewer**: enter Right Ascension/declination and
field of view, then inspect real images of that patch in chronological playback. Motion and brightness
changes are both relevant. Optional AI hints use the ML researcher's completed inference package.

The 29 October 2026 plan follows the full challenge description supplied by the user. Core delivery
is the coordinate-driven movie and tests on **Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae
and R Draconis**. The expanded release includes every potential consideration: 102-band exploration,
six detector composites, spectra, add/subtract, FOV control, Gaia/WISE, updates, links/embedding and flags.

The product name is **AegisEarth**, as confirmed on 1 November 2026. The SPHEREx viewer scope and current implementation plan continue unchanged. Existing database/volume names, migration revisions and legacy CLI aliases are retained for compatibility. The frontend owner has accepted the production UI handoff.

The primary implementation scope is Python/FastAPI, PostgreSQL, scientific processing, Docker and Hugging Face.
At the user's request, the production React UI is now integrated with implemented backend steps 0–10,
preserving its designer's colors, fonts and styles. See the [frontend integration guide](docs/frontend_integration.md).
Public-host/device/scientific acceptance remains separate. The researcher
owns model development/training/evaluation; backend work integrates/verifies/serves the package.
The viewer works independently of detection, ranking or a trained model. Repository name remains
[Ahiraf/AegisEarth](https://github.com/Ahiraf/AegisEarth).

## Start here

- [Detailed implementation plan](todo_plan.md): ordered feature slices and actual exit evidence.
- [SRS v2.9](SRS.md): required viewer, expanded considerations, boundaries and acceptance.
- [Optional ranker v2](docs/metadata_ranker.md): native cutouts, SkyBoT jobs, candidate API and score meaning.
- [Production frontend integration](docs/frontend_integration.md): live controls, configuration and verification limits.
- [Interactive worlds](docs/interactive_worlds.md): separate pages, full-screen scenes, object details and atmosphere exploration.
- [Step 11 local release report](docs/step11_release.md): performance, recovery, five-target demo and hosted acceptance.
- [Challenge coverage matrix](docs/challenge_alignment.md): every supplied objective/consideration mapped.
- [Executed step 6 results](docs/verification/targets/README.md): five-target API/browser receipts and scientific limits.
- [Five-target validation protocol](docs/target_validation.md): exact investigations and honest outcome states.
- [Public source register](docs/sources_and_challenge.md): independently checked resources and access limits.
- [Pipeline](docs/backend_pipeline.md), [API/React contract](docs/api_contract.md), [data model](docs/data_model.md).
- [Science validation](docs/science_ml_validation.md), [optional model handoff](docs/model_handoff.md).
- [Deployment](docs/deployment.md), [verification record](docs/verification.md).
- [Existing real-data research](docs/research/README.md): pinned M101 controls/report/executed notebook.
- [Local foundation](docs/foundation.md): locked Docker/PostgreSQL/HTTPS gateway and reproducible checks.
- [Five-target data evidence](docs/research/target_feasibility/README.md): real cutouts, identities, flags and limitations.
- [Movie delivery and React handoff](docs/movie_delivery.md): frozen timelines, cached previews and local Aladin proof.
- [Context, refresh and sharing](docs/context_sharing.md): Gaia/WISE layers, coordinate links, reference embeds and GIF exports.
- [Derived operations](docs/derived_operations.md): detector coadds, strict difference gates, diagnostic spectra and exports.
- [Prepared frame/band contract](docs/frame_preparation.md): view-v2, official channels, masked grids and eligibility.
- [Durable view inputs](docs/views.md): anonymous jobs, isolated worker, verified artifacts and storage.
- [Implemented discovery API](docs/discovery.md): coordinates/FOV, releases, snapshots and React examples.

## Actual implementation status

| Present now | Planned; not implemented |
| --- | --- |
| Health/config/CORS and truthful capability reporting | Public hosting acceptance |
| discovery-v1 coordinate/FOV/date/band discovery, target presets and release registry | Scientific motion/variability approval |
| Additive jobs/discovery/view/preparation/movie/refresh tables and restricted transaction RPCs | Science-grade photometry/difference acceptance |
| Quota-limited view jobs, isolated worker, cancellation and local/S3 storage adapters | Scientific motion/variability approval |
| Optional metadata_ranker package v2, native 15′ cutouts, SkyBoT candidate jobs and stored warnings/uncertainty | Public ranker UI and scientific/redistribution acceptance |
| QR2/QR3 readers, official 102-channel catalog, fixed-grid frames/previews, quality/registration/band gates | Science-grade calibration acceptance and external scheduler operation |
| Gaia/AllWISE catalogs and W1/W2 context images, coordinate state links, reference embeds, bounded refresh and GIF exports | Public embedding and external scheduler acceptance |
| Production React search/movie, band/detector selectors, coadd/difference/spectrum/export controls, overlays, links/refresh and optional Aladin | Fresh real-pixel frontend rerun after IRSA recovery; public-device/Aladin acceptance |
| Derived coadd/spectrum jobs, six detector selectors, FITS/CSV exports and independent numerical controls | Real-data science-grade difference/photometry approval |
| Frozen movie manifests/pages, ETag previews, isolated React/Aladin playback and local real-data proof | Production share/embed and cloud deployment |
| Hash-locked Docker builds, disposable PostgreSQL and authenticated TLS gateway | Production HF/storage connectivity acceptance |

`POST /api/v1/observations/search` now implements **discovery-v1**; the old radius-search body receives
410 with an explicit replacement. See [the working example](docs/examples/discovery_search.json).
The legacy observation-ID `POST /api/v1/analyses` contract remains **503 feature_not_ready**.
The explicit `metadata-ranker-v1` contract is implemented and disabled by default;
see [enablement and API](docs/metadata_ranker.md). Its limits are separate from viewer limits.
`POST /api/v1/views` now durably queues bounded input acquisition without a model.
Legacy view-v1 reports **inputs_ready**. New view-v2 reports **frames_prepared**, with PNG/FITS
artifacts and comparison diagnostics. Step 5 adds movie-v1 manifests/pages, explicit readiness states,
physical time metadata and a verified local React/Aladin reference. Playback readiness is independent
of scientific comparison eligibility. Production React controls are integrated; cloud deployment remains separate.
Steps 7–8 add bounded coadd/difference/spectrum jobs and exports. Real spectra are explicitly diagnostic;
frames-v1 lacks the calibration/PSF/covariance evidence needed to enable science-grade subtraction.
Current [OpenAPI](docs/openapi.json) describes runtime routes. Discovery returns actual sampled epochs
and whole-image band bounds; it does not claim a complete survey, local wavelength coverage or a movie.

## Local setup

With Docker Desktop's Linux engine running, from repository root:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Compare an existing `.env` rather than overwriting its credentials. API docs: `http://localhost:8000/docs`.
Compose starts PostgreSQL, migration, API, the input-acquisition worker and frontend at `http://localhost:5173`.
The frontend proxies the API on the same origin. Preserve unrelated DBs/volumes.

Without Docker, provision a PostgreSQL database/user and use the backend environment:

```powershell
Copy-Item .env.example backend/.env
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\uvicorn app.main:app --reload
```

Check the DB URL/private environment before migrations. Reuse an existing environment when appropriate.
Optional imaging: `pip install -e ".[dev,imaging]"`; notebook research: `pip install -e ".[dev,research]"`.
No model/framework/weights are supplied or trained by this setup.

## Feature organization

Existing infrastructure/science modules: `observations`, `comparisons`, `analyses`, `cutouts`,
`preprocessing`, `registration`, `differencing`, `artifacts`, `health`. Optional AI modules:
`detection`, `association`, `ranking`, `candidates`.

`targets` now supplies the verified catalog/GET route and `releases` a four-collection registry.
`views` and `bands` now implement acquisition/preparation/movie delivery and band context.
`coadds`, `differencing`, `comparisons` and `spectra` now own derived routes and processing; `analyses` shares durable admission/worker orchestration. `overlays` now owns fixed-provider survey context; `releases` owns refresh leases and the scheduler CLI. `views` owns versioned sharing/reference embeds, while `artifacts` owns queued GIF rendering. Scientific
functions consume arrays/units/metadata; routers handle HTTP and heavy work belongs in leased workers.
PostgreSQL stores relations/provenance; raw/derived files live in external object storage or local dev cache.

## Checks and deployment boundary

```powershell
cd backend
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check app tests migrations
.\.venv\Scripts\python -m app.pipeline.cli
```

Tests use disposable databases only; migration tests may downgrade them. The CLI still describes the
old disabled registry until the viewer pipeline is deliberately implemented/versioned.

The isolated foundation stack has tested native PostgreSQL and a separate authenticated HTTPS
repository adapter, including transaction/lease/restart behavior. Real HF connectivity remains pending
because no cloud resources are configured. See [foundation](docs/foundation.md) and [deployment](docs/deployment.md).

The supplied brief resolves feature alignment; separate organizer rules/deadline still require verification.
No new runtime capability, target test, commit, push, deployment or DB reset is implied by this plan revision.
