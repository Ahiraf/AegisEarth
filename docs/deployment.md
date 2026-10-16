# Hugging Face deployment

Local development uses PostgreSQL, FastAPI and React/Nginx containers plus a migration job.
A Docker Space builds the root Dockerfile, not Compose. Its multi-stage image compiles React
and serves it with FastAPI on port 7860. Both frontend and backend are in the deployed image.
Use external PostgreSQL with TLS and backups; Space-local files are not database durability.

1. Finish local checks and build: `docker build -t aegisearth-space .`.
2. Provision PostgreSQL reachable from the Space. Verify outbound access to its host/port.
3. Configure `DATABASE_URL` with `postgresql+psycopg://` and provider-required TLS options
   (at least `sslmode=require`, certificate validation where supported). Never commit credentials.
4. Run `alembic upgrade head` from `backend` against that database in a trusted shell or
   one-shot container. Apply migrations once per release, not in every API worker.
5. Create a Hugging Face Docker Space and push this project from an actual clone of
   `Ahiraf/AegisEarth`. Preserve root README metadata and Dockerfile.
6. Set `DATABASE_URL` as a Space secret. Add `NASA_API_KEY` when NeoWs ingestion exists.
   React calls same-origin `/api`; frontend builds need no credentials.
7. Check `/api/v1/health/live`, `/api/v1/health/ready`, `/docs`, `/api/v1/neos` and the UI.
   Unknown `/api/...` routes must return 404.
8. Restart and confirm database rows persist. Inspect startup logs and stale-data status.
9. Configure external scheduled ingestion once implemented; a sleeping Space cannot guarantee cadence.
10. Add GitHub-to-Space synchronization after CI passes and credentials are configured.
    Store tokens in CI secrets. Record rollback and backup/restore procedures.

The workspace was empty and not a Git checkout. No remote push, database provisioning or
deployment has been performed. Inspect/reconcile the existing GitHub repository before transfer.

Official references, checked 2026-10-16:
- https://huggingface.co/docs/hub/spaces-sdks-docker
- https://huggingface.co/docs/hub/spaces-storage
