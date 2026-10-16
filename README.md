---
title: AegisEarth
emoji: 🌍
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
---

# AegisEarth

NASA Space Apps scaffold for near-Earth object exploration, risk context and education.
FastAPI REST API, PostgreSQL, React + TypeScript + Vite, Docker and Hugging Face Docker Spaces.
Target repository: https://github.com/Ahiraf/AegisEarth

## Start locally with Docker

Install Docker Desktop and start its Linux engine. From this folder:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open http://localhost:5173, API docs at http://localhost:8000/docs and readiness at
http://localhost:8000/api/v1/health/ready. Compose waits for PostgreSQL, applies Alembic
migrations in a one-shot service, then starts the API. The catalog initially returns an empty list.
`docker compose down` stops services and keeps the named database volume.
Example credentials are development defaults; change them for deployment.
Use URL-encoded credentials when constructing a database URL.

## Run without Docker

Run PostgreSQL separately and create the database/user from `.env.example`.
Copy `.env.example` to `backend/.env` (the backend loads it from its working directory).

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\uvicorn app.main:app --reload
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to port 8000. API docs are on port 8000 in this mode.

## Feature-based backend

```text
backend/app/
  main.py                   # router/middleware assembly
  core/                     # configuration, database, SPA hosting
  modules/
    health/router.py        # liveness and database/schema readiness
    catalog/                # implemented identity model and list/detail API
      models.py
      schemas.py
      repository.py
      router.py
    approaches/             # planned encounter feature
    risk/                   # planned risk assessment feature
    ingestion/              # planned adapters and refresh jobs
    education/              # planned learning feature
    visualization/          # planned map/timeline feature
```

Each feature owns its models, schemas, routes, business services, queries and tests.
Add `service.py` when business rules exist; avoid empty forwarding layers.
Routers delegate business operations to services; services use repositories.
Cross-feature operations use explicit service interfaces. Shared infrastructure belongs in `core`.
Register new model modules in `migrations/env.py` before generating migrations.

## Checks

```powershell
cd backend
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\ruff check app tests migrations
cd ../frontend
npm run build
```

See [todo_plan.md](todo_plan.md) for feature milestones and acceptance checks, and
[deployment guide](docs/deployment.md) for Hugging Face.
The [Software Requirements Specification](SRS.md) defines product scope, feature requirements,
data/API contracts, quality targets and acceptance criteria.
Recorded checks and remaining runtime verification are in [verification notes](docs/verification.md).

Implemented: database wiring, initial catalog migration, catalog list/detail, health endpoints,
React starter, local containers and a combined Space image definition.
Planned: live ingestion, risk data, maps, timeline, education and deployment automation.
No fabricated observations are seeded. This scaffold does not yet perform impact prediction.

The supplied PDF is planning context. Its API/scientific assumptions require verification;
the roadmap records corrections and follows the requested FastAPI/PostgreSQL/React stack.
