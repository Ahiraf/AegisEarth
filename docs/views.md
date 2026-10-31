# Step 3 — durable viewer input acquisition

Implemented locally, 31 October 2026. This slice accepts public coordinate requests and acquires
validated native FITS inputs. Its successful result is **inputs_ready**, not a registered movie.
Frame preparation and manifests remain steps 4–5; detection/model access is not required.

## Start and submit

`docker compose -f compose.foundation.yaml up -d --build` starts the isolated PostgreSQL/API,
HTTPS gateway and native worker with a shared persistent artifact volume. Swagger:
`http://localhost:18000/docs`. Ordinary `compose.yaml` uses API port 8000 and its own volumes.
Run `alembic upgrade head` for non-compose installations; the additive revision is `cosmic_0004`.

Set a stable, random, **server-only** `PUBLIC_TOKEN_SECRET` of at least 32 characters on each API
replica. Native local compose has explicitly development-only fixtures. An unconfigured API returns
503 for session initialization/submission. Production requires HTTPS and `PUBLIC_COOKIE_SECURE=true`.
The worker uses native PostgreSQL and does not need the public token secret.

1. Call `GET /api/v1/views/session` and retain the HttpOnly anonymous cookie. React uses
   `credentials: "include"` for this and subsequent submissions. No account or shared browser secret.
2. POST [view_request.json](examples/view_request.json) to `/api/v1/views`, with a new UUID in
   `Idempotency-Key`. No observation IDs, URLs, ranking method or model is accepted.
3. Poll returned `status_url` or `job_url`. A new durable acceptance is 202 with Location; a replay
   or completed-input cache reuse is 200. The response contains a cancellation capability only
   when the current anonymous client owns that request. Keep it out of logs, share links and URLs.
4. Cancel via `POST /views/{id}/cancel`, `Authorization: Bearer <cancel_token>`. The capability is
   job-specific; knowing a public view ID or sharing its cache does not grant cancellation permission.
5. After success, `GET /artifacts/{id}` returns metadata/download URL, and `/artifacts/{id}/content`
   serves hash-verified FITS bytes. Storage keys, worker fencing tokens and credentials are not public.

Example React submission (after establishing the session cookie):

```javascript
const response = await fetch(`${api}/api/v1/views`, {
  method: "POST",
  credentials: "include",
  headers: {"Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID()},
  body: JSON.stringify({
    contract_version: "view-v1",
    region: {ra: 269.45, dec: 4.76, width_arcmin: 3, height_arcmin: 3},
    collections: ["spherex_qr3"],
    max_frames: 1
  })
});
```

Use the same cookie and key for retries; the same key with changed canonical parameters is 409.
Initialize the cookie before the first submission so a lost acceptance response can be retried in
the same scope. Public GET status has no cancellation token. Wrong/missing cancellation capability
returns 404. Status/submission/session responses are `no-store`.

Explicit React origins are required in `CORS_ORIGINS`; credentialed wildcard origins are not used.
HTTPS cookies use SameSite=None for a separate frontend origin; local insecure cookies use Lax.
Submission checks supplied Origin against the allowlist. Direct CLI clients may omit Origin.
Uvicorn images disable proxy-header trust; quota IPs come from the actual connection, not arbitrary
X-Forwarded-For headers. A future trusted ingress must configure this boundary explicitly.

## Frozen selection and limits

Coordinate/date/collection/detector/wavelength filters follow [discovery-v1](discovery.md). First use
can omit dates. Discovery runs before acceptance; after successful persistence, processing survives
API restarts. Idempotent replay is checked before discovery, so archive outages do not prevent
retrieving an already accepted job. Discovery failure produces no accepted job.

The frozen discovery snapshot supplies server-validated products. `max_frames` is 1–12, default 6.
`selection_policy=evenly_spaced_sample` explicitly selects products across the returned chronological
sample. The canonical request records selected/available counts, whether selection was limited and
all discovery completeness warnings. This is not an assertion that unlike detectors are comparable,
nor that the archive sample contains every epoch. Actual band/time grouping remains step 4.

PostgreSQL serializes admission. Defaults, configurable only on the server:

| Bound | Default |
| --- | --- |
| Active jobs per signed anonymous client | 2 |
| Accepted submissions per client / connection IP per hour | 10 / 30 |
| Global queued + running view jobs | 20 |
| Global active leased workers | 2 |
| Attempts / absolute accepted-job deadline | 3 / 15 minutes |
| Per-attempt wall / child CPU / RSS | 180 seconds / 60 seconds / 512 MiB |
| Per input / cumulative transfer bytes | 128 MiB / 256 MiB |
| Science axes / total decoded HDU bytes per FITS | 512 × 512 / 64 MiB |
| Concurrent artifact reads per API process | 2 |
| Published input retention | 24 hours after completion |

The anonymous cookie can be replaced; per-client quotas are not proof of a human identity. Independent
IP and hard global queue/worker limits bound that exposure. NAT/proxy users can share IP quota.
All replicas must use the same secret and admission/worker policy. Admission quotas are authoritative
database decisions, not independent in-memory counters. Hourly submissions include completed-cache
hits; idempotent retries do not count again. No public bulk/admin refresh or file-upload route exists.
Maintenance is a native operator CLI; scheduled/authenticated refresh is step 10.

## Worker, files and failure behavior

Start a native worker outside compose with `python -m app.modules.views.worker`; `--once` claims
at most one job. It cannot use a PostgREST URL in place of a PostgreSQL connection. `SKIP LOCKED`
claims and a global capacity lock prevent duplicate claims. Running jobs have a 120-second renewable
lease and a fresh fencing token per attempt. A dead worker's expired lease can be reclaimed; only
the current live token can pin bytes, prepare uploads or complete a job. Expired/exhausted jobs fail.

The worker creates a private attempt directory and runs acquisition in a subprocess. It checks
CPU/RSS/disk/wall budgets while renewing the lease. Native limits use resource monitoring; compose
also imposes a hard 768 MiB container envelope, one CPU and a PID cap. Downloads and object uploads
run inside that monitored child. Native deployments should preserve equivalent container limits.
Cancellation/lease loss terminates the child and fences publication; an upload racing cancellation
may leave an unpublished object, which the ledger makes eligible for cleanup.

Only validated IRSA HTTPS FITS product links are resolved; no arbitrary URLs or redirects. SIA
already provides direct data links, so a DataLink resolver is not required for these collections.
An enclosing cutout preserves the requested rectangle and reserves one arcminute for later grid
preparation. This does not establish actual full-FOV coverage: partial detector overlap remains
possible. Response size, streamed bytes/length, elapsed transfer time and SHA-256 are checked before
atomic staging. Transfers allow at most 120 seconds (connect 5 / network I/O 20 seconds), within
the monitored attempt budget. Slow requests fail rather than publish partial data.

Validation checks FITS structure, HDU count/decoded sizes, input identity/detector/time scale,
science dimensions/grids, checksum cards when present and required IMAGE/VARIANCE/FLAGS/ZODI/
WCS-WAVE plus QR2 PSF or QR3 EPSF extensions. Scientific mask/response/registration eligibility
is deliberately `not_evaluated` at this step. Missing FITS checksum cards are recorded; backend
SHA-256 is always computed. A retry's previously pinned bytes must match, including FITS serialization;
a changed source fails for review rather than silently updating a frozen request.

Each validated receipt is pinned transactionally. An upload ledger entry is created before storing
bytes; it is unpublished until all expected files are present and fenced completion commits.
Native/HTTPS read paths expose only committed, unexpired, published files. Transient source/storage
failures retry with bounded delay; validation/changed-source/budget failures terminate safely.
After a DB outage, the child is stopped and the worker reconnects; durable lease recovery governs retry.

## Local and external object storage

Default `OBJECT_STORE=local` uses the shared artifact volume. Files use immutable, attempt-scoped,
content-hashed keys and atomic publication. `OBJECT_STORE=s3` enables the boto3 S3 adapter: configure
`S3_BUCKET`, optional credential-free HTTPS `S3_ENDPOINT_URL`, `S3_REGION`, and standard server-side
AWS credentials on API and worker. PutObject is conditional (`IfNoneMatch=*`) with SHA-256; existing
objects must verify. Downloads are size/hash checked before serving; no public presigned secret URLs.
The API and worker must use the same storage backend. Back up the database and objects together.

The S3 SDK contract, integrity failures and deletion are tested locally with botocore Stubber.
No external bucket/account has been provisioned; real provider TLS/permissions/conditional-write
compatibility remains a deployment check. No cloud expenditure or cloud deployment is implied.

Run `python -m app.modules.views.worker --cleanup` periodically from the native worker environment.
Each call selects at most 100 eligible ledger objects and checks at most 100 stale staging directories;
`--cursor` continues a reported object page. Objects from failed/canceled attempts become eligible
after 24 hours; published objects follow their completion retention. Active jobs are excluded.
Deletion is idempotent and ledger-marked after success, so storage failures can be retried. No unbounded
bucket listing or destructive database reset. Public source/snapshot provenance remains preserved.

## Verification

See [verification record](verification.md) and [live input acquisition](verification/views_report.json).
Tests exercise concurrency/quota races, idempotency and conflict/replay during archive outages,
lease recovery, old-worker fencing, cancellation capability isolation, source pin changes, unpublished
artifact invisibility, cache ownership, expiry/cleanup, truncated/invalid FITS, byte/dimension/CPU/RSS/
disk limits, storage corruption and the S3 SDK contract. `python scripts/verify_views.py` executes a
real local coordinate request, isolated worker, IRSA transfer and verified artifact download.

Legacy `/analyses` remains disabled; the new view route does not turn on the old model-dependent
analysis pipeline. Frozen input acquisition is the handoff for the next image-processing slice.
