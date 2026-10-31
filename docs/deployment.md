# Backend deployment plan

Revised 29 October 2026. FastAPI remains the Python REST API in a Hugging Face Docker Space.
PostgreSQL and durable files remain external. The React owner owns its separate frontend container/
Space, public playback and embed route. Root/backend Dockerfiles package the API and standalone input-acquisition worker; the isolated local foundation now includes a verified HTTPS database gateway. No cloud viewer,
worker, gateway or model has been deployed.

## 1. Prove production database transport first

[HF networking documentation](https://huggingface.co/docs/hub/spaces-overview#networking) restricts
outbound requests to ports 80, 443 and 8080. Ordinary PostgreSQL 5432 must not be assumed reachable.
This is an early architecture gate in plan step 0, not an issue to discover after building every slice.

The user selected local-only preparation because cloud resources are not set up. A restricted HTTPS
PostgREST adapter and disposable local TLS stack now pass transaction/lease/restart checks; see
[foundation](foundation.md). The actual Space/provider check below remains a deployment task.

1. Use a temporary development Space plus a disposable database to test DNS/TLS, credentials,
   the actual supported provider port/transport, read/write transactions and API readiness.
2. If native PostgreSQL on an allowed port is genuinely supported, pin/test that configuration with
   certificate verification; do not merely change a 5432 URL to 443 and assume it works.
3. Otherwise use a provider-supported authenticated HTTPS database API/gateway on 443. A candidate
   is [PostgREST](https://docs.postgrest.org/en/stable/references/api/functions.html), backed by PostgreSQL.
   Implement a distinct repository/readiness adapter; the current SQLAlchemy engine does not speak that API.
4. Multi-table job acceptance, lease claim/renewal, cancel and publication require transactional SQL
   functions/RPCs with constraints. Several independent REST writes are not an atomic transaction.
5. Run Alembic migrations and native SQL workers from a DB-reachable CI/worker network. Validate
   transport equivalence with disposable PostgreSQL tests and restrictive gateway roles/function exposure.
6. Record the selected route, provider/cost/credentials/network/restore evidence before enabling jobs.

No external provider/gateway has been provisioned; the local PostgREST gateway is tested. Do not expose a broad SQL/admin endpoint
or put database/service-role credentials into the public React application.

## 2. Local development

With Docker Desktop's Linux engine available, compare `.env.example` to existing private environment
files and run `docker compose up --build`. Current Compose starts a fresh project PostgreSQL,
migration, API and a resource-bounded input-acquisition worker; frontend is separate. Retain existing volumes and unrelated DBs.
`cosmic_0001` is the initial schema; subsequent feature changes use new migrations.

API docs: `http://localhost:8000/docs`. Check liveness, database/schema readiness and actual disabled
capabilities. discovery-v1 is now implemented; legacy radius search returns 410 and analysis remains
503. Apply cosmic_0004 and the documented discovery/view grants. Public submissions need a stable
PUBLIC_TOKEN_SECRET; [view input guide](views.md) covers TLS cookies, quotas and storage. Migration tests target only
the disposable TEST_DATABASE_URL or temporary local SQLite; SQLite is not a PostgreSQL deployment proof.

## 3. API, files and worker topology

1. Build/test root API image on port 7860 as UID 1000; preserve README Docker Space metadata.
2. Configure external PostgreSQL through the tested repository transport and external object storage
   through HTTPS with TLS, least privilege, bounded cache/retention and consistent backups.
3. Deploy a durable CPU worker/scheduler where database/native science/network requirements are met.
   Use one slot initially, leased PostgreSQL work, bounded retries/deadlines and no heavy FastAPI handlers.
4. If co-locating API/worker, supervise both processes and explicitly test signal handling, sleep/restart,
   lease recovery and cold-start resources. Do not rely on a sleeping Space to perform continuous refresh.
5. Set explicit React origin/API CORS and artifact/cache/Range behavior as needed for FITS/preview/exports.
   Public bounded view requests need quotas/cancel ownership; admin refresh/bulk actions need private auth.
6. Expose named, truthful availability for movie/coadd/difference/spectrum/Gaia/WISE/optional AI.
   Missing inference does not disable image playback. Optional framework/GPU follows the researcher's package.

Server-side secrets include DB/gateway/object storage and optional approved weights access. React and
share/embed URLs carry no secrets. Space disk is a cache; published manifests and curated target
artifacts persist externally. Run migrations as a controlled release action, not on every worker claim.

## 4. Frontend deployment handoff

The frontend team builds its React Docker image/Space and supplies public explore/view/embed routes,
play/pause/speed/scrub, FOV/band selectors, metadata/flags, spectrum and overlay presentation.
Use direct public quota-limited API calls; a BFF may be added for a justified purpose but is not required
to hide a shared key for ordinary users. Never bundle admin/DB credentials into JavaScript.

Agree source attribution, accessible keyboard/reduced-motion controls, image preloading and public
artifact origins. Validate Aladin FITS/WCS/catalog layers separately from the lightweight frame player.
Test CSP/frame-ancestors and actual iframe embedding from another site; coordinate query URLs and
immutable view links have distinct latest-versus-frozen semantics.

## 5. Release evidence

- API/image/package checks and disposable PostgreSQL migration/drift/repository-transport tests.
- Atomic job acceptance/claim/cancel/publish, cache invalidation and source-refresh deduplication.
- External DB/object storage restore plus Space/API/worker sleep/restart recovery.
- Cold/warm CPU/memory/transfer measurements on all five target fields and larger FOVs.
- Real backend → public React → movie, bands/coadds/difference/spectrum, Gaia/WISE, URL restore/iframe.
- Target-specific query/quality/sensitivity limits and dated cached examples for upstream outages.
- Source/software/model credits and full organizer submission/eligibility/deadline verification.

Continuous deployment/synchronization is not enabled by this planning update. Commit/push to main as
anindya357 and deployment actions occur only when explicitly authorized; preserve existing history.

Primary hosting references: [Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker),
[Space storage](https://huggingface.co/docs/hub/spaces-storage),
[network/lifecycle](https://huggingface.co/docs/hub/spaces-overview#networking).

## Step 4 implementation update

[view-v2 frame preparation](frame_preparation.md) now uses release-aware readers, strict masks,
fixed-grid reprojection/marginal variance, independent-reference residual checks, nominal/local-band
context, explicit bins and shared/per-frame previews. Additive cosmic_0005 adds prepared_frame_sets
and prepared_artifacts with fenced atomic raw/derived publication and bounded merged cleanup.
Existing v1 jobs are preserved. API and native worker images include SciPy/Pillow; the official
R7 catalog is packaged with source member hashes. Step 5 now adds [frozen movie delivery](movie_delivery.md) and a locally verified React/Aladin handoff.
Quantitative operations, cloud deployment and scientific target-recovery sign-off remain later gates.
