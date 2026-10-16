# Scaffold verification

Verified 2026-10-16:

- React TypeScript check and production build: passed (`npm run build`).
- Frontend dependency installation: npm reported zero known vulnerabilities.
- Backend: 5 tests passed (liveness/OpenAPI, catalog reads/filtering/validation/readiness,
  and SPA fallback/API error behavior).
- Ruff: passed for app, tests and migrations.
- `pip check`: passed.
- PostgreSQL migration offline SQL generation: passed (`alembic upgrade head --sql`).
- Docker Compose configuration: passed (`docker compose config --quiet`).

Backend API tests used an isolated SQLite database locally; CI is configured to use migrated
PostgreSQL. Passing SQLite tests does not establish PostgreSQL runtime compatibility.
The tests needed execution outside the Windows sandbox because event-loop socket setup stalled
inside it. The current Starlette TestClient emitted a deprecation warning about its httpx transport;
track that upstream change when updating test dependencies.

Not executed: container image builds, full Compose startup, live PostgreSQL migration roundtrip,
browser visual checks and Hugging Face deployment. Docker Desktop's Linux engine was unavailable.
Scientific provider integrations and geographic impact predictions are future features.
