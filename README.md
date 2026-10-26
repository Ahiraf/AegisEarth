---
title: Cosmic Motion AI API
emoji: 🔭
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# Cosmic Motion AI

Backend for AI-assisted discovery of moving-source candidates in SPHEREx observations.
A user selects observations of the same sky region; the service will prepare comparable images,
highlight candidate changes, and deliver source evidence with clearly labeled ranking scores.

Your delivery scope is **backend work only**: Python 3.12+, FastAPI REST, PostgreSQL,
image-processing module boundaries, Docker packaging and a detailed delivery plan.
The frontend teammate maintains `frontend/` independently and can integrate its React viewer against
the API contract. Their newer work on GitHub is preserved alongside this backend update.
The **ML researcher builds and trains the main model** and provides its complete inference package.
Your role is to integrate it, reproduce its expected outputs and serve it reliably; model architecture,
training datasets, hyperparameter tuning and retraining are outside your backend deliverables.
Existing Git repository URL: https://github.com/Ahiraf/AegisEarth (repository name has not been changed).

## Current implementation

| Available now | Specified and planned |
| --- | --- |
| FastAPI app, CORS, liveness and database/schema readiness | IRSA discovery and verified repeat observations |
| Observation search and analysis request validation | FITS cutout acquisition and scientific preprocessing |
| Seven-table initial schema and Alembic migration | Registration, PSF/background matching and differencing |
| Eleven-stage pipeline registry and CLI description | Detection, association and classical ranking |
| Versioned ranking interface and probability-label guard | Trained CNN/Siamese ranking and sequence tracking |
| Backend tests, Dockerfiles and PostgreSQL CI configuration | Durable worker queue, artifact delivery and public demo data |

`POST /api/v1/observations/search` and `POST /api/v1/analyses` currently return an explicit **503
feature_not_ready** after request validation. They do not fetch images, enqueue jobs or run a model.
`GET /api/v1/system/capabilities` exposes this state. An empty database is not a successful analysis.

## Run locally

With Docker Desktop's Linux engine running, from the repository root:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

If `.env` already exists, compare/update it rather than overwriting credentials. Local API docs:
http://localhost:8000/docs. Liveness: `/api/v1/health/live`; readiness: `/api/v1/health/ready`.
Compose starts PostgreSQL, applies the new migration, then starts the API. No frontend service exists.
The new Compose project/database/volumes are separate from the previous product's database.
Do not point this replacement migration baseline at an existing unrelated database.

Without Docker, create a PostgreSQL database/user matching your environment and then:

```powershell
Copy-Item .env.example backend/.env
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\uvicorn app.main:app --reload
```

Check the URL in `backend/.env`; use URL-encoded credentials. The backend loads `.env` from its
working directory. Existing local virtual environments may be reused with `pip install -e ".[dev]"`.
Image-processing dependencies are intentionally optional until their milestones:
`pip install -e ".[dev,imaging]"`. PyTorch and trained weights are not installed or supplied.

## Backend layout

```text
backend/app/
  main.py                       # app assembly
  core/                         # config, database, errors, model registration
  pipeline/                     # ordered stage specifications and executor interface
  modules/
    observations/               # IRSA metadata and observation identity
    comparisons/                # compatibility policy and report
    analyses/                   # job lifecycle, inputs, stage records
    cutouts/                    # trusted FITS acquisition and caching
    preprocessing/              # masks, variance, wavelength, background/PSF
    registration/               # common celestial WCS and residual checks
    differencing/               # difference/significance maps
    detection/                  # per-epoch sources and residual detections
    association/                # motion/brightness/artifact association
    ranking/                    # classical or trained ranker, model versions
    candidates/                 # result records and evidence
    artifacts/                  # storage references, previews and provenance
    health/                     # operational checks
```

Feature modules own their schemas, models, routers, repositories, services and adapters as needed.
README-only modules are deliberate implementation boundaries, not working scientific stages.
Heavy processing belongs in a future leased worker, outside API requests. PostgreSQL holds metadata;
FITS/images/model weights belong in artifact storage. Stage outputs publish atomically after validation.

## Planning documents

- [SRS](SRS.md): requirements, boundaries, API behavior, quality targets and acceptance criteria.
- [Detailed backend todo plan](todo_plan.md): feature-by-feature implementation order and exit checks.
- [Backend pipeline](docs/backend_pipeline.md): stage inputs/outputs, failure rules and worker design.
- [API and frontend handoff](docs/api_contract.md): request examples, planned endpoints and score semantics.
- [Data model](docs/data_model.md): identity, relationships, provenance and storage contracts.
- [Science and ML validation](docs/science_ml_validation.md): scientific controls, researcher evaluation evidence and backend integration checks.
- [Researcher-to-backend model handoff](docs/model_handoff.md): required package, ownership and integration acceptance.
- [Sources and challenge alignment](docs/sources_and_challenge.md): primary references and verification limits.
- [Deployment](docs/deployment.md): backend-only Hugging Face Space and external persistence.
- [Verification](docs/verification.md): checks actually run and outstanding runtime work.

## Checks

```powershell
cd backend
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check app tests migrations
.\.venv\Scripts\python -m app.pipeline.cli
```

Migration tests use temporary SQLite locally and the disposable PostgreSQL database identified by
`TEST_DATABASE_URL` in CI. Do not set that variable to a database containing real work.
The migration test intentionally upgrades, checks drift and downgrades that test database.

## Delivery boundaries

Two observations support candidate motion evidence; confirmation and track quality need additional
evidence. A residual can be a brightness change or processing artifact. Scores are not discovery
claims, object identities, orbital solutions or calibrated probabilities without validation.
The first release prioritizes a truthful, repeatable two-epoch comparison; CNN/Siamese ranking is
integrated only after labels and evaluation exist. See the plan for the full AI milestone.

No commit, push, repository rename, deployment, model training or database reset is implied by this setup.
