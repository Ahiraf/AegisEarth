# Step 0 — local persistence foundation

Implemented and verified 29 October 2026. The user explicitly selected **local preparation/testing**
because Hugging Face, external PostgreSQL and object storage are not provisioned. This completes
the local foundation; real Space-to-provider connectivity and deployment remain untested.

## What works

- Hash-locked production, build, test and optional full development dependency sets for Python 3.12.
  Docker installs with `--require-hashes`, then installs this package without resolving dependencies.
- Python, PostgreSQL, PostgREST and Caddy base images pinned to the digests actually built/tested.
- Additive migration `cosmic_0002`: `processing_jobs` and six restricted PostgREST RPC functions.
- Step 2 adds `cosmic_0003`, immutable discovery tables, two discovery RPCs and updated readiness.
  Re-run migration/grants; [discovery verification](verification/discovery_report.json) covers native/TLS parity.
  The seven-table `cosmic_0001` baseline is preserved; no prior database is reset.
- Native PostgreSQL and a separate authenticated HTTPS gateway repository/readiness path. HTTPS
  certificate verification stays enabled; local development uses an explicitly supplied local CA.
- Transactional enqueue/idempotency conflict, SKIP LOCKED claims, lease heartbeat/token fencing,
  completion and scoped cancellation. These are persistence primitives, not an enabled processing API.
- Disposable PostgreSQL migration upgrade/drift/downgrade and actual DB restart/persisted-job recovery.

[Machine-readable verification](verification/foundation_report.json) records eleven passing local
checks, including denied anonymous access and gateway recovery after DB restart. No viewer/worker
execution is claimed. Step 2 observation discovery is available; image/analysis execution remains unavailable.

## Reproduce locally

The isolated project is `cosmic-foundation`; ports are deliberately separate from normal project
and existing applications: PostgreSQL **55432**, API **18000**, verified HTTPS gateway **18443**.

```powershell
docker compose -f compose.foundation.yaml up --build -d
New-Item -ItemType Directory -Force -Path var/foundation
docker compose -f compose.foundation.yaml cp gateway:/data/caddy/pki/authorities/local/root.crt var/foundation/root.crt
.\backend\.venv\Scripts\python scripts/verify_foundation.py
# Optional actual restart recovery check; only this disposable DB is restarted.
.\backend\.venv\Scripts\python scripts/verify_foundation.py --restart
```

API: `http://localhost:18000/docs`; live/ready under `/api/v1/health/`. `GET /api/v1/targets` returns
the five curated catalog snapshots, not live discovery/detection. The root Hugging Face image also
passed a [local port-7860/UID-1000/readiness/target smoke test](verification/image_smoke.json).
Its temporary smoke container was stopped; foundation containers/volumes are retained for development.
No other project's containers/volumes were removed.
Local fixture credentials in `compose.foundation.yaml` are deliberately development-only, never
production secrets. The verifier generates a short-lived local JWT and does not put it in its report.

For migration tests, create a **separate disposable DB**, such as `cosmic_migration_test`, in the
foundation DB service; do not point this test at the running API database or a database containing work:

```powershell
docker compose -f compose.foundation.yaml exec -T db psql -U cosmic -d cosmic_foundation -c "CREATE DATABASE cosmic_migration_test"
$env:TEST_DATABASE_URL='postgresql+psycopg://cosmic:local-foundation-only@127.0.0.1:55432/cosmic_migration_test?connect_timeout=5'
cd backend
.\.venv\Scripts\python -m pytest -q
```

The creation command is for first use; don't recreate an existing test DB. Tests intentionally upgrade,
check metadata drift and downgrade only TEST_DATABASE_URL. Native connection timeout is bounded.

## Dependency lock workflow

Install production/build locks, then the test lock for tests or the optional full dev lock when those
science/research packages are needed. The test lock avoids installing unused notebook/imaging packages.

```powershell
cd backend
.\.venv\Scripts\python -m pip install --require-hashes -r requirements.lock -r requirements-build.lock
.\.venv\Scripts\python -m pip install --require-hashes -r requirements-test.lock
.\.venv\Scripts\python -m pip install --no-deps --no-build-isolation -e .
```

Regenerate intentionally with uv 0.13.6 and Python 3.12, review the diff and rerun validation:

```text
uv pip compile pyproject.toml --universal --python-version 3.12 --generate-hashes -o requirements.lock
uv pip compile requirements-build.in --universal --python-version 3.12 --generate-hashes -o requirements-build.lock
uv pip compile pyproject.toml -c requirements.lock --extra dev --universal --python-version 3.12 --generate-hashes -o requirements-test.lock
uv pip compile pyproject.toml -c requirements.lock --all-extras --universal --python-version 3.12 --generate-hashes -o requirements-dev.lock
```

On this Windows machine uv required its cache/TMP/TEMP on the same project drive; use directories
under ignored `var/` if cross-drive cache moves fail. Full optional imaging libraries remain locked,
but their scientific methods are not implemented merely because versions are recorded.

## Hosting decision and limits

Selected local proof: FastAPI → authenticated HTTPS PostgREST → PostgreSQL 17. Native PostgreSQL
remains the migration/worker transport. A production Space would use the HTTPS repository adapter
on port 443 when native PostgreSQL egress is unavailable; the current app's readiness supports both.
Do not substitute an HTTPS URL into SQLAlchemy. See [deployment](deployment.md) for the cloud gate.

Topology for later deployment: Space API, external persistent PostgreSQL/PostgREST, durable CPU
worker/scheduler and HTTPS object storage. Local files under `var/` remain a cache. No cloud provider
or GPU is purchased/activated. **Current new cloud spending is zero**; keep that ceiling until the user
chooses resources. Proposed first worker concurrency is one; later public processing retains the
SRS's bounded FOV/frame/byte/time budgets and must be benchmarked before activation.

Before public jobs: provision least-privilege production roles/JWT/secrets, test real Space HTTPS/TLS
and native migration access, choose object store/retention/backups, and implement stage executors,
quotas/cancel ownership and publication. The foundation RPC is server-only and not a public job route.

## Docker incident resolved

Docker Desktop initially failed binding its stale `dockerInference` socket. A normal stop timed out;
the failed Docker processes were stopped, the runtime-socket directory was renamed to a backup,
and Docker restarted successfully. Images/containers/volumes/settings were retained; no factory reset,
WSL unregister, reinstall or data pruning was used. The machine-local backup remains under Docker's
local application runtime directory. This repair is not an application deployment prerequisite elsewhere.

## Step 5 local update

Additive cosmic_0006 adds immutable movie manifests/readiness and restricted HTTPS movie RPCs.
Local CORS explicitly allows the isolated reference player on localhost/127.0.0.1:15173. The
[real-data/API/React/Aladin evidence](movie_delivery.md) covers local playback without ML and zero/single
outcomes; no actual Space-to-database test or production frontend-owner acceptance is implied.

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
