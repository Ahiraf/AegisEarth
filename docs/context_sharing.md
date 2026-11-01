# Steps 9–10: survey context, refresh, coordinate links and exports

Backend delivery, 2 November 2026. AegisEarth remains a coordinate-driven SPHEREx viewer.
These feature modules add optional survey context and sharing without a trained model or changes to
the production `frontend/`. The backend includes small reference pages to exercise the REST handoff.

## Implemented routes

All routes below are under `/api/v1`. Existing public view-session, quota, cancellation and artifact
contracts continue to apply. Source views must have prepared movie frames; expired views return 410.

| Route | Behavior |
| --- | --- |
| GET `/views/{id}/overlays/catalogs?survey=gaia&ordinal=0&mode=common&limit=100&propagate=true` | Gaia DR3 catalog markers and explicit proper-motion predictions on the selected frame |
| GET same route with `survey=wise` | AllWISE W1/W2 catalog context with band-specific time spans and quality flags |
| GET `/views/{id}/overlays/wise/1` or `/2` | W1/W2 image metadata, provenance, epoch interval and PNG/FITS links |
| GET image route with `format=png` or `format=fits` | Bounded image resampled onto the exact selected SPHEREx frame grid |
| POST `/share/links` | Validated share-v1 state → canonical coordinate query and configured React/reference URLs |
| GET `/share/resolve?v=1&ra=...&dec=...&width=...&height=...` | Restore full normalized view-v2 request and display mode without starting a job |
| GET `/views/{id}/links` | Frozen-ID link, finite expiry, source hash and coordinate link |
| GET `/share/viewer?...` | Backend reference request-restore page; starts processing only after button press |
| GET `/share/embed/{id}?mode=common` | Accessible reference iframe playback, catalog toggles, WISE opacity and legends |
| POST `/views/{id}/refresh` | Idempotent, quota-limited explicit metadata refresh and rebuilt view; old view stays frozen |
| GET `/releases/refresh-status` | Latest ten metadata-check reports, timestamps and registry versions |
| POST `/releases/refresh` | Protected bounded discovery refresh; server-only admin Bearer token |
| GET `/views/{id}/export-metadata?format=json` or `csv` | Frozen movie/source metadata, units, chronology, source links and credits |
| POST `/views/{id}/exports` | Bounded asynchronous captioned GIF plus provenance JSON |
| GET `/exports/{id}` | Export report and artifact references; pending 202, failed/canceled 409, expired 410 |

## Catalogs and images

The adapter uses fixed IRSA TAP tables `gaia_dr3_source` and `allwise_p3as_psd`. Caller-controlled ADQL,
URLs and provider names are not accepted. Queries are restricted to a prepared view's sky patch, capped
at 500 sources, two concurrent misses per process, 30-second request timeouts and 2 MB catalog bodies.
`TOP limit+1`, ordered by distance from the requested catalog-position center, detects truncation and
prioritizes useful local context. This ordering cannot guarantee inclusion of every fast mover whose
older catalog position falls outside a crowded capped sample. Cache TTL
is configurable (default one hour) with at most sixteen process-local entries. Restart discards this
optional cache; frozen SPHEREx manifests are stored separately in PostgreSQL.

Gaia retains exact string IDs, ICRS coordinates, reference epoch, proper motions, parallax, errors,
G magnitude and RUWE. `pmra` already includes cos(dec); Astropy receives it as `pm_ra_cosdec`. A supplied
reference epoch and both proper motions are required before propagation to the frame's actual epoch.
Predictions omit radial velocity and observer-dependent annual parallax, and retain that limitation.
Missing astrometry leaves the catalog position unchanged. Query padding permits up to 60 arcsec/year
over at most fifty years; finite padding and source caps cannot promise a complete mover search.
Position-error fields remain in native units; propagated error ellipses are not invented.

AllWISE retains W1/W2 profile-fit magnitudes/errors, contamination/photometry/extension flags and each
band's MJD minimum/maximum/mean. There is no inferred single epoch or unvalidated WISE proper-motion
propagation. Catalog points are context, not source associations or SPHEREx detections.

AllWISE Atlas IBE inventory supplies coadd IDs and observation time spans. Only validated IDs construct
fixed-host cutout URLs. Downloads are bounded to 16 MB and native dimensions ≤2100. Requests use the
service's documented `gzip=false` option so the byte budget applies to uncompressed FITS directly.
Output follows the
selected frame's ≤512-pixel WCS grid. Bilinear display resampling retains missing pixels as NaN/PNG alpha.
Original-unit FITS and independently stretched PNG are context products, not matched-PSF scientific
comparisons. WISE images never fill missing SPHEREx movie epochs. W1/W2 metadata includes the source
URL/hash, coadd time span, units, display stretch and credits.

Provider errors return an explicit unavailable overlay with a retry hint. They do not change a movie,
prevent frame retrieval or get relabeled as empty catalogs. The reference viewer isolates those errors.

Primary sources: [IRSA TAP](https://irsa.ipac.caltech.edu/docs/program_interface/TAP.html),
[Gaia DR3 at IRSA](https://www.ipac.caltech.edu/doi/10.26131/IRSA544),
[AllWISE Atlas IBE](https://irsa.ipac.caltech.edu/ibe/docs/wise/allwise/p3am_cdd/),
[IBE cutouts](https://irsa.ipac.caltech.edu/ibe/cutouts.html).

## Refresh and latest-release behavior

`DISCOVERY_TTL_SECONDS` defaults to 900 (60–86400). Each new snapshot records retrieval, next revalidation,
registry version and completeness. Explicit refresh obtains a PostgreSQL per-query lease with a default
300-second cooldown, then re-queries the existing validated release adapters. A five-minute lease and
token-fenced completion prevent concurrent writers; interrupted checks can be retried after expiry.
Failed checks remain visible; they do not certify archive absence or calibration correctness.

Refresh may discover newly indexed observations or newer processing variants. Existing physical-exposure
deduplication prefers validated QR3/newer versions while retaining alternates. Old snapshot, view and
movie records are never rewritten. A rebuilt view has a new cache key tied to its snapshot; normal worker
capacity, acquisition budgets, creator cancellation and retention still apply. An idempotent retry is
replayed before new discovery calls. Source byte/format limits can still cause a rebuilt job to fail.

`POST /releases/refresh` requires `REFRESH_ADMIN_TOKEN` (at least 32 characters), kept server-side.
The public view refresh endpoint first applies normal admission controls and shares the same per-query
cooldown; users cannot activate arbitrary collections. New release schemas, PSF formats, calibration and
science acceptance must be reviewed before adding an adapter/registry version. IRSA SIA ingestion lag
and truncated metadata remain explicit; newest metadata is not proof of full survey completeness.

For an external scheduler, use the native-PostgreSQL CLI:

```powershell
# requests.json is a list of 1–5 existing, validated discovery-v1 request bodies.
python -m app.modules.releases.refresh --request-file requests.json
```

Run this command from a durable scheduler/worker host with the backend environment. No scheduler is
provisioned by this local work; a sleeping Hugging Face Space cannot guarantee scheduled execution.
Additive `cosmic_0008` adds `release_refresh_checks` and extends GIF publication. Native and authenticated
HTTPS paths call the same restricted functions; grant the API role SELECT/INSERT/UPDATE on this new
table and EXECUTE on its RPCs, as shown in `scripts/provision_local_gateway.py` for the local fixture.

## Coordinate URLs, React integration and embedding

POST `/share/links` accepts `{ "version":"share-v1", "request":{...view-v2 body...}, "mode":"common" }`.
Canonical query keys include decimal RA/Dec, rectangular FOV, dates, collections, detectors, wavelength
bounds, max_frames, all `p_` preparation options and display mode. Sexagesimal input is normalized to
degrees. Unknown/duplicate keys, invalid coordinates/options, oversized queries and unsupported versions
are rejected. No credentials or cancellation tokens belong in URLs. Restoring a URL does not submit a
job; React presents the returned request before an explicit POST `/views` with a session/idempotency key.

`FRONTEND_VIEWER_URL` is the deployment's configured React route. The separate `reference_viewer_url`
works against the backend directly and demonstrates fresh-browser restoration. Production React must
consume the same resolve/link/overlay contracts; its new controls require the frontend owner's integration.
The earlier step-6 acceptance is not silently treated as acceptance of these newly added controls.

Frozen-ID links pin the manifest, not unlimited object storage: expiration is returned and respected.
Re-querying an old view's canonical coordinates is explicit. An expired view can still provide its stored
request to the refresh endpoint; expired image bytes remain unavailable.

Reference embeds start paused, label actual UTC dates/bands separately from playback speed, provide
keyboard stepping, frame scrub/speed controls, reduced-motion text, survey toggles/opacity and download
credits. Set `EMBED_ANCESTORS` to exact allowed `http(s)://host[:port]` origins plus `'self'`; production
defaults to self only. Local compose additionally permits `http://127.0.0.1:15174` for the independent-site
test. CSP permits only same-origin assets/API/images and explicit frame ancestors; URL parameters never
select a script/provider host. CORS remains separately configured for the production React origin.

## Export contract

```json
{
  "contract_version": "export-v1",
  "inputs": [{"view_id":"00000000-0000-0000-0000-000000000001","index":0}],
  "frame_duration_ms": 700,
  "loop": false
}
```

Use preparation-report indices, not movie ordinals. Export accepts 1–12 unique physical inputs from up
to six identical-grid parent views. The existing derived-job protocol verifies/copies inputs, enforces
shared quotas/leases/byte/CPU/RSS/disk limits, and republishes source lineage under child retention.
GIF frames follow observing time and one shared display stretch; captions retain date, detector, units,
quality limits and attribution. Small previews are enlarged by an integer nearest-neighbor factor
(up to 8×) for readability; this adds no spatial information and the original grid stays in the JSON
sidecar. Display duration is 100–2000 ms and is not physical elapsed time. A
single input produces a static GIF. JSON sidecars retain full contributor metadata/hashes and original
source references. GIF quantization is display-only; original/derived numeric FITS and spectrum CSV/JSON
remain available through their existing endpoints. MP4 is deferred because GIF satisfies the optional
bounded animation export without adding a video encoder dependency.

## Reproduction and acceptance boundaries

```powershell
docker compose -f compose.foundation.yaml up -d --build
.\backend\.venv\Scripts\python scripts/verify_context_sharing.py
node handoff/player/verify-context.mjs
```

The verifier uses the unexpired step-6 WISE source view; rerun target preparation if it has expired.
Live API receipts are [context_sharing.json](verification/context_sharing.json); browser evidence is
[context_browser.json](verification/context_browser.json). Backend tests include high proper motion,
RA wrap, missing astrometry, masks/grid orientation, body limits, provider outage isolation, coordinate
state round trips, newly discovered controlled inputs, frozen snapshots, lease fencing and GIF export.
Actual public hosting, scheduler operation, production React integration and science-grade cross-survey
photometry remain separate acceptance tasks. The unresolved step-7/8 scientific gates remain unchanged.
