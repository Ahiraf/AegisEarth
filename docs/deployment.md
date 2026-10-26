# Backend-only deployment

The root Dockerfile is the Hugging Face Docker Space API image. `backend/Dockerfile` is the local API
image built from repository root. Both package Python only and do not build or host the separately
maintained React app in `frontend/`.

## Local environment

1. Install/start Docker Desktop's Linux engine and choose free local ports if 5432/8000 are occupied.
2. Compare `.env.example` with any existing `.env`; retain private values and update database names/URLs.
3. Run `docker compose up --build` from root. The Compose project is `cosmic-motion-ai` and uses new volumes.
4. Check `http://localhost:8000/docs`, health endpoints and `/api/v1/system/capabilities`.
5. `docker compose down` stops the new project while retaining its named volumes. No old data volume
   deletion or migration of a previous product is required or performed by this plan.

The replacement Alembic revision is `cosmic_0001` and must target a fresh database. If an old database
exists, keep it separate; do not stamp/reset it as a shortcut. Migration tests use only a disposable
`TEST_DATABASE_URL` (or temporary SQLite locally) and deliberately downgrade that test database.

## Hugging Face API setup

1. Build/test `docker build -t cosmic-motion-api .` locally/CI.
2. Create a Docker Space and preserve root README `sdk: docker` and `app_port: 7860` metadata.
3. Provision external PostgreSQL and durable artifact/model object storage. Verify permitted outbound
   access, TLS, least-privilege roles, capacity and backups.
4. Set DATABASE_URL as a runtime secret using `postgresql+psycopg://...` and provider-required TLS options.
   Configure explicit CORS_ORIGINS for the separate frontend. Do not put database/submission secrets in React.
5. Run migrations once as a release job against the new production database.
6. Deploy the API image; validate docs, liveness, schema readiness, CORS and capability truthfulness.
7. Keep submission disabled (currently explicit 503) until the real adapters/queue/stages, storage, model
   selection and protection/quotas have been implemented and tested.
8. When artifacts are implemented, persist them externally; local Space disk is only a cache. Configure
   the storage adapter and private submission credential through runtime settings added at that milestone.
9. Verify restart does not lose published files or accepted jobs and that frontend artifact URLs work.

## Worker and model hosting decision

No worker is implemented or launched by the current Compose/Dockerfiles. Add a worker service when
actual stage executors and leased jobs exist. Preferred production design: API in the Space and a
separate durable CPU worker sharing PostgreSQL and object storage. It may be a second managed service.

If co-locating worker and API within one Space, add a proper supervisor with signal handling, measure
CPU/memory limits and validate lease recovery after sleep/restart. A sleeping API is not a reliable
always-running worker. Start with one worker slot and small cutouts. GPU selection is conditional on
measured model requirements; no GPU/trained model is assumed by this scaffold.

Model weights need a checksum, permitted use, model card and approval. Download/cache only a pinned
approved model reference; do not execute arbitrary pickle/checkpoint content or load a random model
while labeling its scores as trained predictions.
The researcher supplies the model/runtime requirements; backend deployment installs that pinned
inference runtime and verifies golden outputs in the worker image. Do not choose PyTorch/ONNX/CUDA
versions or GPU hardware before checking the delivered package. Training containers/jobs are outside scope.

## Release checks

- Backend tests/lint and real PostgreSQL migration/drift tests pass.
- Real pair and synthetic-control end-to-end processing meet measured science/resource thresholds.
- Public reads and protected submission/cancel permissions/quotas work from the frontend integration.
- Queue claims, worker crash/restart/cancel, provider outage and storage failure are tested.
- Database plus file references restore consistently; curated demo results survive restart.
- Health/capabilities, source/calibration/model versions and error messages are truthful.
- Confirm the complete challenge brief/submission requirements before claiming release readiness.

GitHub synchronization/deployment automation is not enabled by this setup. Commit/push to main using
anindya357 only when explicitly requested. Repository URL/name remains unchanged.

Primary hosting references: [Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker),
[Space storage](https://huggingface.co/docs/hub/spaces-storage).
