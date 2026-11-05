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
migration, API, a resource-bounded input-acquisition worker and the frontend container. Retain existing volumes and unrelated DBs.
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

## Steps 7–8 implementation update

[Derived jobs](derived_operations.md) now reuse shared admission/lease/cancellation/retention and the
raw/prepared artifact ledger. Additive cosmic_0007 adds guarded derivative admission, CSV publication
and typed coadd/spectrum/difference routes without resetting tables. Coadds and physical-unit sparse
spectra are implemented; actual frames-v1 differences remain blocked by missing quantitative science
acceptance. Diagnostic extraction is not validated spectrophotometry. Public cloud deployment and
scientific calibration/reference acceptance remain separate gates.


## Steps 9–10 implementation update — 2 November 2026

[Survey context and sharing](context_sharing.md) implement bounded Gaia DR3/AllWISE markers and W1/W2
images, actual epoch/WCS/quality/attribution, coordinate-state links, finite frozen IDs, reference iframe
delivery, explicit metadata refresh and durable GIF exports. `cosmic_0008` adds `release_refresh_checks`
for fenced per-query metadata checks; export jobs reuse the existing job/upload/retention protocol.
Optional context uses a bounded process-local cache; it never mutates a published SPHEREx movie.
New production React controls, external scheduler operation and public-host acceptance remain separate.

## Production React integration — 5 November 2026

The [production React UI](frontend_integration.md) now exposes completed backend workflows through
step 10 while retaining the designer's theme. The normal Compose file includes frontend Nginx on
localhost:5173, proxying `/api/` to `api:8000`; the production bundle and container build locally.
Environment files are excluded from the image build context. Vite development supports a local API
proxy; separate-host builds accept a public API origin. No server secrets are bundled.
The Step 11 frontend image serves on port 7860 as UID 1000. Local Compose maps it to port 5173.
Fresh movie and Aladin verification remain open while the local API cannot reach IRSA.

## Step 11 hosted release sequence

The [local Step 11 receipt](step11_release.md) records what ran with disposable resources. The
following sequence starts once the team has the intended hosting accounts and external services.

1. Provision PostgreSQL, a restricted HTTPS PostgREST gateway and a separate CPU worker host with
   native PostgreSQL access. Apply Alembic and the gateway role/function policy from the DB network.
   Use a trusted public CA for the gateway and verify anonymous calls fail. Keep the worker and refresh
   scheduler on infrastructure that remains active when a Space sleeps.
2. Provision a private S3-compatible bucket and set the API and worker to the same bucket, region and
   HTTPS endpoint. Store service credentials in the hosting secrets manager. Rehearse coordinated
   database and object recovery before routing public traffic.
3. Use the repository-root `Dockerfile` and existing Docker Space README metadata for the API Space.
   Set `DATABASE_TRANSPORT=postgrest`, the gateway URL/token, the object-store settings, stable
   `PUBLIC_TOKEN_SECRET`, `PUBLIC_COOKIE_SECURE=true`, the exact frontend origin in `CORS_ORIGINS`,
   the public viewer URL and intended `EMBED_ANCESTORS`. Confirm readiness from the Space itself.
4. In a separate frontend Space use `frontend/Dockerfile` as its repository-root `Dockerfile`, keep
   `frontend/` at that same build-context path, and set `sdk: docker` and `app_port: 7860` in its README.
   Leave `VITE_API_BASE_URL` empty for same-origin sessions. Set the runtime Space variable
   `AEGISEARTH_API_UPSTREAM` to the API Space’s public HTTPS origin without a trailing slash. Nginx
   verifies the upstream certificate and proxies `/api/` to that origin.
5. In a fresh browser submit a permitted view, reload and cancel a second view, inspect the cookie,
   verify artifact ETags and embed the result from the intended second origin. Check quota behavior
   behind the reverse proxy and test keyboard/reduced motion on the intended devices. Check a fresh
   IRSA movie and a successful Aladin FITS load. Record live transfer and queue measurements.
6. Pause and restart the API Space during a queued or running job. Verify worker progress and the
   immutable artifact IDs after the API returns. Then restore the database and bucket into separate
   test destinations and verify a published object against its recorded checksum. Review the deployed
   service and submission checklist before sharing it publicly.

See the [Hugging Face Docker Space guide](https://huggingface.co/docs/hub/spaces-sdks-docker) and
[Space networking and lifecycle reference](https://huggingface.co/docs/hub/spaces-overview).
