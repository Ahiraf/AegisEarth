# Step 11 local release verification

5 November 2026. The release verification uses local resources as requested. The acceptance evidence
below separates fresh service calls, historical IRSA data, controlled tests and hosted checks.

## Local reliability evidence

| Check | Result |
| --- | --- |
| Linux API image | Root Dockerfile ran on port 7860 with UID 1000. PostgreSQL readiness, CORS preflight, five target presets, installed dependency consistency and lockfile hashes were checked. [Image receipt](verification/step11_image.json) |
| PostgreSQL transport | Authenticated HTTPS through local PostgREST and a trusted local TLS CA passed. Anonymous calls were denied. Duplicate requests reused a job, conflicting keys rolled back, one worker claimed each job, expired leases recovered and canceled workers were fenced. The gateway recovered after PostgreSQL restarted. [Gateway receipt](verification/step11_gateway.json) |
| Failure handling and artifact delivery | The PostgreSQL integration suite exercises provider outages, limits, atomic admission, worker cancellation and storage integrity. The scoped artifact HTTP check covers SHA-256 ETags, `304` with an empty body, private caching, and `503` when content is corrupt or missing. |
| Backup and restore | Restore an isolated test database with `pg_dump` and `pg_restore`, then verify the restored object against the artifact record from the restored ledger. [Restore receipt](verification/step11_restore.json) |
| Frontend | The production image ran on port 7860 as UID 1000. Same-origin sessions and runtime limits worked through the proxy. The five served preview hashes matched their source files. All 12 controlled browser tests passed. Prior second-origin iframe evidence uses the backend reference player with real pixels. [Frontend receipt](verification/step11_frontend.json), [iframe receipt](verification/context_browser.json) |

Reproduce the isolated database and image checks from the repository root using Docker Desktop and
the existing backend environment. The tests truncate tables in the named test database.

```powershell
docker compose -f compose.foundation.yaml up -d gateway api worker
docker build -f Dockerfile -t aegisearth-api:step11 .
docker compose -f compose.foundation.yaml exec -T db createdb -U cosmic cosmic_step11_test
Push-Location backend
$env:TEST_DATABASE_URL = 'postgresql+psycopg://cosmic:local-foundation-only@127.0.0.1:55432/cosmic_step11_test?connect_timeout=5'
.\.venv\Scripts\python -m pytest -q -p no:cacheprovider --basetemp=../var/t11
.\.venv\Scripts\python -m pytest -q -p no:cacheprovider --basetemp=../var/t11r tests/test_views.py::test_api_cookie_idempotency_cancel_and_verified_download
Pop-Location
.\backend\.venv\Scripts\python scripts/verify_step11_restore.py --artifact-root var/t11r/test_api_cookie_idempotency_ca0/artifacts
.\backend\.venv\Scripts\python scripts/verify_image_smoke.py --image aegisearth-api:step11 --output docs/verification/step11_image.json
.\backend\.venv\Scripts\python scripts/verify_foundation.py --restart --output docs/verification/step11_gateway.json
```

Reuse the named disposable test database if it already exists. The HTTPS gateway check expects the
locally trusted CA file at `var/foundation/root.crt`. See the certificate extraction instructions in
[local foundation](foundation.md). The recovery check removes its uniquely named restore database.

## Five-target processing measurements

All 27 archived IRSA cutouts were checked against their source hashes. Each target and FOV ran twice
in its own fresh Linux process. The first and repeat passes share the filesystem cache. A separate
two-process run exercised 30′ grids for Barnard’s Star and WISE 0855 and took 7.35 seconds including
process startup and both passes. The container was limited to two CPUs and 768 MiB of memory.

| Requested grid | First preparation | Repeat preparation | Peak process RSS | Output bytes per case |
| --- | ---: | ---: | ---: | ---: |
| 3′ × 3′, 30 × 30 pixels | 1.00–1.51 s | 1.08–1.45 s | 115.6–117.6 MiB | 241,388–365,525 |
| 30′ × 30′, 293 × 293 pixels | 1.44–2.44 s | 1.22–2.15 s | 136.9–143.7 MiB | 6,015,183–9,027,146 |

Each case used 4–6 cutouts totaling 15.13–29.03 MiB. Larger grids reused the pinned sky footprints.
These timings measure preparation and local file output. They exclude archive download and queue delay.
The public form estimates the comparison grid and displays the running API’s configured limits before
submission. [Per-target measurements](verification/step11_benchmark.json)

Run `scripts/benchmark_step11.py` inside the API Linux image with the repository mounted read-only at
`/work`, `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, `--cpus 2`, `--memory 768m` and no container
network. The cutouts must be present at the paths in the [pinned source manifest](research/target_feasibility/cutouts_manifest.json).
Each manifest entry gives the original `url`, `local_path`, size and SHA-256 for restoring a missing
input from the archive. Keep the pinned manifest if the archive serves different bytes and capture
the changed data as a separate run.

## Five-target demo and credits

1. Run `docker compose up --build` and open `http://localhost:5173`. Select a challenge target or
   enter its coordinates. To reproduce the archived live case, use the saved request in its receipt.
2. Play the chronological frames, step with the keyboard, compare a pair, then inspect the observing
   time, source product and quality metadata. The [five-target evidence](verification/targets/README.md)
   lists which request variant produced an animation and records the empty and single-epoch cases.
3. If the archive is unavailable, open **Archived previews for the five challenge targets** and select
   a dated contact sheet. These bundled previews were generated during the 1 November 2026 validation
   and keep observation labels and links to their provenance. Live requests remain a separate flow.
4. Use the contact-sheet notes to discuss Barnard’s Star and R Draconis masking, the Epsilon Indi B
   system identity, the WISE 0855 supplied coordinate and prediction, and RW Aurigae’s sampled epochs.
   The project has diagnostic measurements with scientific acceptance gates for calibrated claims.

Credit the SPHEREx mission and NASA/IPAC IRSA for the survey data. Credit ESA Gaia and NASA/IPAC
WISE for optional context, Astropy for coordinates and FITS, and CDS Aladin Lite for the optional map.
Individual products, releases, timestamps and checksums are in the [source register](sources_and_challenge.md)
and [target receipts](verification/targets/summary.json).

## Remaining acceptance

| Item | Evidence needed |
| --- | --- |
| Fresh real-pixel acceptance | A fresh IRSA view in production React, positive Aladin FITS loading, and live network, queue and transfer measurements at representative and larger FOVs. The latest local API probe ended with an unexpected EOF during TLS setup. |
| External durability | Hosted PostgreSQL through the selected TLS transport, object-store backup and clean restore, separate CPU worker, scheduler, and evidence of queued and running jobs surviving a Space sleep/restart. |
| Public acceptance | Frontend and API Spaces with a verified anonymous session, hosted embed with the intended CSP origins, real-device checks, public asset access, and complete coverage-matrix sign-off. |
| Scientific acceptance | Step 7 and 8 empirical gates and remaining six-detector positive coverage. The local checks do not establish science-grade subtraction or photometry. |
| Organizer submission | Confirm the team’s registered Local Event, event-specific pitch schedule and Project Tab requirements. The [2026 organizer page](https://www.spaceappschallenge.org/2026/) gives the November 14 09:00 to November 15 23:59 submission window in local event time. Verify references and participant requirements against the [official terms](https://www.spaceappschallenge.org/legal/). The challenge URL returned 502 during checking. |

The hosted topology and deployment order are in the [deployment guide](deployment.md).
