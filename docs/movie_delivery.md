# Step 5: movie delivery and React handoff

Implemented locally on 1 November 2026 (Asia/Dhaka). The API serves real chronological SPHEREx
previews without a model, encoder, WebGL or Aladin dependency. The isolated
[React reference player](../handoff/player/src.jsx) proves the handoff; `frontend/` is untouched.
Frontend-owner handoff acceptance in the production UI was confirmed by the user on 1 November 2026. Public Hugging Face deployment remains a separate gate.

## Request and delivery

Submit [view-v2](examples/prepared_view_request.json) with `Idempotency-Key` and the session cookie.
Poll the returned status URL; the job still succeeds at `frames_prepared`. Its delivery state is separate.

| Route under `/api/v1` | Behavior |
| --- | --- |
| GET `/views/{id}` or `/jobs/{id}` | Job state, manifest URL, `delivery_state`, truthful per-view availability; no-store |
| GET `/views/{id}/manifest` | `movie-v1`, frozen SHA-256, request/snapshot, timeline summaries, first preview and preload candidates |
| GET `/views/{id}/frames?mode=common&offset=0&limit=4` | Stable ordinals/IDs, total, next page, complete frame metadata; limit 1–12 |
| GET `/views/{id}/frames/{ordinal}/coordinates?x=3&y=5&origin=png` | Zero-based PNG pixel → ICRS degrees; `origin=fits` uses lower-left zero-based pixels |
| GET `/views/{id}/frames/{ordinal}/coordinates?ra=269.45&dec=4.76` | ICRS degrees → zero-based pixel; `inside` indicates footprint bounds |
| GET `/artifacts/{id}/content` | Hash-verified original FITS, prepared MEF, PNG or JSON; conditional ETag |
| GET `/artifacts/{id}/science.fits` | Bounded, deterministic primary 2D science FITS for Aladin v3; original MEF is retained |

Manifest/frame reads return 202 + Retry-After while queued/running, 404 for an unknown view, 409 for
failed/canceled or legacy unprepared views, and 410 after retention expiry. Do not interpret 202 as an
empty sky. `view-v1` remains input-only; submit `view-v2` to obtain prepared movie delivery.

The first successful status/manifest read materializes the deterministic representation in additive
`cosmic_0006.movie_manifests`. PostgreSQL verifies the supplied preparation equals the committed report,
the view succeeded and is unexpired; first insert wins. Subsequent reads never replace the manifest.
Both native and authenticated HTTPS repositories call the same restricted RPCs. No user/admin/model
credentials, lease tokens, cancellation capabilities or storage keys enter the manifest.

Each representation has an ETag; send `If-None-Match` to receive 304. Manifest/page ETags include their
selectors, while `manifest_sha256` identifies the full frozen payload including both timelines. Retain
that hash across pages. Manifest/page private cache TTL is bounded by 60 seconds and remaining retention;
artifact private caching is at most 60 seconds, with fresh server reads checked against publication/expiry.
The original uploaded bytes remain SHA-verified. The primary science response is derived from those
verified bytes, retaining WCS/units/NaNs, with its own deterministic byte hash/ETag. It is not a new
scientific product or replacement for variance, masks and spectral planes in the MEF.

## Playback versus scientific eligibility

| Outcome | Meaning | Player behavior |
| --- | --- | --- |
| `no_data` | No usable preview in that timeline | Explain coverage/filter limits; no animation |
| `single_epoch` | Fewer than two distinct midpoint epochs, even if multiple images exist | Inspect/scrub only; no play/loop/blink |
| `ready_for_animation` | At least two distinct playable epochs | Playback allowed; scientific flags remain independent |

Default `common` mode uses the prepared sky-fixed grid. When a supported comparison group exists,
it uses that group (and any explicitly requested bins). Otherwise it exposes usable common-grid frames
as **quality-limited browsing**, with `comparison_supported=false`. It never claims registered motion,
calibrated variability, subtraction or photometry merely because frames animate. The separate `native`
timeline retains usable input previews, explicitly labels varying orientation/FOV, and is never silently
substituted for the common grid. A requested channel/strict mask can yield no common frames while native
inspection remains available. Original inputs and the full preparation report remain accessible.

Ordering is midpoint MJD, start MJD, then immutable frame ID; ties remain deterministic. UTC ISO labels
have six decimals, with MJD retained as strings from the prepared values; unchanged raw FITS preserves
original header precision. Physical elapsed/gap/overlap seconds are computed with Astropy UTC-aware
time differences. Bins use an explicitly labeled interval midpoint and retain every contributor interval.
Display speed changes milliseconds per image only. It does not imply uniform observing cadence.

Frames include wavelength-proxy details, detectors, MJy/sr and variance units, WCS/shape/origins,
stretch, usable coverage, mask definitions, registration/PSF limitations, original input hashes/URLs,
release/calibration/DOIs and artifact references. WCS-WAVE is a visualization proxy; quantitative
calibration/PSF matching/covariance and the five-target science acceptance remain open.

## Reference player and Aladin spike

```powershell
docker compose -f compose.foundation.yaml up -d --build
cd handoff/player
npm ci
npm run dev
```

Open `http://127.0.0.1:15173`, submit RA 269.45, Dec 4.76, FOV 3 arcmin, or load an unexpired view UUID.
Only this isolated reference runs on 15173; the production frontend is owned by the React developer.
API CORS must explicitly allow the chosen UI origin. Do not copy local foundation secrets to production.

The reference implements play/pause, opt-in loop, speed, scrub/step, two-epoch blink, side-by-side,
UTC/physical-time text, provenance/flags, keyboard controls and reduced-motion/manual start. It pauses
when the tab is hidden. The first small PNG loads before sequential best-effort preloads, respecting
the two-download bound; visible previews retry at most three times. Metadata pages remain bounded.
Video encoding/export, production styling and full share/embed restoration are later work.

Aladin is dynamically imported at pinned **3.8.1** only on request. It loads this backend's primary 2D
FITS, adds an explicitly labeled requested-field-center catalog marker (not a detection or Gaia layer),
and verifies `world2pix`/`pix2world`. Empty initial survey/HiPS lists avoid requiring the unrelated default
DSS service. WebGL2/WASM/widget failure leaves PNG playback operational; Aladin retains its logo/credit.
Its interactive display stretch is separate from the movie PNG's recorded shared asinh stretch.

Primary API/source references: [Aladin API](https://cds-astro.github.io/aladin-lite/Aladin.html),
[pinned package/source](https://github.com/cds-astro/aladin-lite/tree/v3.8.1),
[embedding guidance](https://github.com/cds-astro/aladin-lite/blob/master/README.md).

## Reproduce verification

The API verifier creates or reuses a bounded local three-frame view and stores its ID/request in
ignored `var/foundation/step5-live.json`. It excludes cancellation credentials from newly stored receipts.
Run it before the browser verifier:

```powershell
.\backend\.venv\Scripts\python scripts/verify_movie_delivery.py
cd handoff/player
npm run build
npm run verify
```

`verify.mjs` uses installed Chrome by default (`PLAYER_BROWSER` overrides its path), plus optional
`PLAYER_URL`/`PLAYER_API`. The dev server must be running. Reports:
[API/real-data proof](verification/movie_delivery_report.json) and
[React/Aladin proof](verification/movie_player_report.json). Screenshots stay ignored under `var/movie-player/`.
The browser additionally simulates empty/single manifests and widget failure; those controls are labeled
as simulations. The API proof separately executes real single-input and genuinely empty pre-mission jobs.

The real three-epoch QR3 D5 sample passes browsing delivery, not comparison/scientific-change acceptance.
No model package, cloud provider, external bucket, public deployment or frontend-owner sign-off is
implied by these local results. The user separately confirmed production handoff acceptance;
[step 6 results](verification/targets/README.md) now record all five target investigations.
