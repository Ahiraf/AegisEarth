# Production React integration

Independent pages update, 8 November 2026: Explorer, Orbits, Atmosphere, Solar System, Learn and
About now mount separately, rather than sharing sections of Explorer. The three educational
scenes fill the available viewport and offer native full-screen mode where supported. Selecting a
mesh, its label or the object list opens a side drawer (bottom drawer on phones). Orbits retain
eight agency-linked facts per mission, with more detailed spacecraft geometry. Planets and Earth
use locally hosted, credited CC BY 4.0 maps. Atmosphere adds an interactive limb cutaway, altitude
slider and numeric height control. All scenes support keyboard controls, reduced-motion defaults,
WebGL fallback and GPU cleanup on navigation. No backend endpoint or dependency was added.
See [interactive worlds](interactive_worlds.md) for controls, licensing and scientific boundaries.
Browser checks are in `frontend/tests/orbits.spec.ts` and `frontend/tests/worlds.spec.ts`, alongside
the existing backend-connected viewer workflow checks. Local captures are in
`var/frontend-integration/world-*.png`.

Backend addition, 8 November 2026: the optional researcher's package v2 is exposed through the
explicit `metadata-ranker-v1` analysis contract. See [ranker API and presentation rules](metadata_ranker.md).
Production React now provides explicit opt-in submission after observation discovery and loading
an existing analysis UUID. Bright candidates appear first in magnitude order; faint known objects
are collapsed under “Known objects too faint for this ranker (N)”. The component preserves null
scores, hint classifications, spread/uncertainty, per-frame evidence and plain warnings. The ranker
remains off by default, excludes the five presets server-side and never gates movie preparation.
Older analyses are marked with their legacy cutout policy rather than presented as current runs.

Updated 5 November 2026 at the user's request. The production frontend in `frontend/` now consumes
the implemented backend through step 10. It retains the designer's existing navy/cyan/amber palette,
DM Sans/Sora/JetBrains Mono fonts, navigation, decorative Earth, educational sections and card styles.
New controls inherit those tokens through `src/styles/sky.css`; the original design tokens are unchanged.

## Run locally

From the repository root, `docker compose up --build` now includes PostgreSQL, migrations, FastAPI,
the worker and the production Nginx frontend. Open **http://localhost:5173**. Nginx proxies `/api/`
to the `api:8000` service, preserving the browser's origin and session cookie. Existing volumes are
preserved. The Step 11 image listens on port 7860 as UID 1000, with Compose mapping it to host port 5173.

For frontend development with an already-running API:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev -- --host 127.0.0.1
```

Compare an existing `.env.local` before copying. Default proxy target is `http://127.0.0.1:8000`.
For the isolated `compose.foundation.yaml` API, set `VITE_API_PROXY_TARGET=http://127.0.0.1:18000`.
Keep `VITE_API_BASE_URL` empty for this same-origin setup. Restart Vite after environment changes.
The local foundation CORS list also permits the browser-test origin `http://127.0.0.1:15175`.

For a separate API Space, leave `VITE_API_BASE_URL` empty and set the runtime variable
`AEGISEARTH_API_UPSTREAM` to the API’s public HTTPS origin. Nginx verifies its certificate and keeps
the browser session same-origin. Allow the exact frontend HTTPS origin in backend CORS. Direct API
builds can set the public `VITE_API_BASE_URL` at build time and require hosted cross-site cookie testing.
Keep service credentials server-side. Local environment files are excluded from the Docker context.
See the [hosted release sequence](deployment.md#step-11-hosted-release-sequence).

## Available workflows and routes

| UI | Backend integration |
| --- | --- |
| Coordinate search, rectangular FOV, UTC dates, release selection, five named targets | `/targets`, `/releases`, `POST /observations/search`, immutable metadata pagination |
| Common wavelengths, detector D1–D6, nominal channel 1–102, display stretch, time bins, mask policy | `/bands`, `view-v2` preparation settings; coverage remains explicit |
| Prepare/open/refresh/cancel a sky view | `/views/session`, `POST /views`, `/jobs/{id}`, `/views/{id}/refresh`, scoped cancel |
| Play/pause, loop/speed, scrub/keyboard, blink, synchronized side-by-side, zoom/pan | Frozen `/manifest` and paginated `/frames`; first preview loads before ancillary processing details |
| Native inspection and sky-fixed browsing, dates/gaps, masks/calibration/source credits | Separate manifest timelines, frame provenance and PNG/FITS downloads |
| Click an image at fit zoom for an extraction position | Backend WCS `/frames/{ordinal}/coordinates` with PNG origin; overlays use the same actual pixel plane |
| Gaia/AllWISE circles/diamonds, W1/W2 images, opacity and epoch legends | Per-frame `/overlays/catalogs` and `/overlays/wise/{band}`; optional failures never stop playback |
| Optional Aladin Lite map | Dynamically loaded 3.8.1; current common-grid primary FITS, field-center context marker and checked world/pixel round trip |
| Detector composites/temporal means/weighted sums | Source preparation indices, `POST /views/{id}/coadds`, result previews/FITS/provenance |
| Signed differences | Pair preflight and queued difference result; actual scientific eligibility reasons remain enforced |
| Clicked/fixed or complete moving-source epoch positions, aperture/background options | Queued diagnostic `/spectra`, sparse error-bar plot, separate-epoch table and JSON/CSV |
| Captioned GIF | Queued `/exports`, GIF and provenance sidecar downloads |
| Coordinate URLs, frozen saved-view links, iframe, metadata downloads | Canonical `/share/links` and `/share/resolve`, saved `/links`, reference embed and JSON/CSV metadata |

Processing selectors can add up to six prepared source views and twelve distinct source observations.
The backend still verifies matching sky grids/regions, retention, byte limits and operation eligibility.
Choose source indices from the **preparation report**, not chronological movie ordinals. A detector
selector does not invent missing detector inputs. Spectra contain measured samples only; no 102-point
interpolation, automatic detection or calibrated variability claim is added.

Coordinate links restore all choices without starting a job. Frozen links reopen saved pixels until
expiry. Refresh explicitly makes a new view; the old manifest remains unchanged. The iframe currently
uses the backend's tested reference player, while saved/coordinate links open the production React UI.
Allow the embedding site's origin in `EMBED_ANCESTORS` before public embedding.

## Code boundaries and failure behavior

- `features/sky/api.ts`, `types.ts`: typed contracts, configured public origin, safe API links,
  credentials, timeouts, sanitized failures, bounded polling and manifest-consistent pagination.
- `useSkyView.ts`, `useDerivedJobs.ts`: independent view and processing state; stale requests abort.
  A lost submission response reuses its UUID idempotency key. Job cancellation tokens remain only
  in memory and never enter URLs or browser storage; reopening a saved view does not grant cancellation.
- `SearchForm`, `MoviePlayer`, `SurveyLayers`, `AladinPanel`: search, pixels, context and optional map.
- `ProcessingTools`, `DerivedResults`, `SharePanel`: explicit processing, evidence and share controls.
- `SavedExplorerpage.tsx`: preserved metadata explorer, selected explicitly via the archive switch or
  `?source=snapshot`. An API outage never silently changes live frames into saved/example data.

No-data and one-epoch timelines remain honest, with no fabricated animation. Playback starts paused,
including reduced-motion mode. Optional ML remains unconnected until the researcher's package is
supplied. Backend resource quotas/retention and step-7/8 scientific acceptance gates remain unchanged.

## Verification

```powershell
cd frontend
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Windows tests use installed Chrome by default, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; Linux CI uses
Playwright Chromium. The suite runs at port 15175 with one browser worker. It uses explicitly labeled
controlled API/image fixtures, covering chronology/pagination, keyboard/reduced motion, sharing,
overlay failures/pixel mapping, source-index correctness, all derived workflows, moving-source epoch
positions, idempotent retry, cancellation, one epoch/no coverage, expiry/refresh, stale-result races,
optional-map failure, 390px layout and preserved saved-record browsing. Fixtures never ship as a
production data fallback. CI now builds and runs this suite.

The local production Docker image also builds, serves HTML and proxies the real API: five target
presets, 102 channels and session initialization returned HTTP 200. A browser against the actual
FastAPI service restored a complete QR2/D6 coordinate URL and correctly displayed the provider failure
when fresh acquisition returned `503 all_sources_unavailable`. A direct request from the API container
confirmed IRSA SIA HTTP 503. A follow-up connection timed out during the TLS handshake.
**A new successful real-pixel end-to-end run and positive production
Aladin loading remain to be repeated when the provider recovers.** Existing dated backend real-data
proofs are retained and are not relabeled as this frontend's live verification. See the
[verification record](verification.md). Public hosting, real-device/public-origin embedding, scientific
acceptance and six-detector live acquisition are still separate release gates.
