# Observation discovery — implemented step 2

Updated 31 October 2026. Requirements: SKY-001–003, OBS-001/003/004 and the discovery portion
of OBS-002/REL-001. Local spectral response/quality, viewer execution and scheduled refresh remain
later steps. See [OpenAPI](openapi.json), [example](examples/discovery_search.json) and
[live verification](verification/discovery_report.json).

## Try the API

Apply `alembic upgrade head` before starting the API. The current revision is `cosmic_0003`.
For the isolated local stack: `docker compose -f compose.foundation.yaml up -d --build`.
Swagger is at `http://localhost:18000/docs`; ordinary compose uses port 8000.

```http
POST /api/v1/observations/search
Content-Type: application/json

{
  "contract_version": "discovery-v1",
  "region": {"ra": "08:55:10.831", "dec": "-07:14:42.53", "width_arcmin": 5, "height_arcmin": 5},
  "collections": ["spherex_qr3", "spherex_qr3_deep", "spherex_qr2", "spherex_qr2_deep"],
  "limit": 20
}
```

This example preserves the brief's WISE 0855 coordinate; it has no supplied astrometric epoch.
Discovery does not silently move user coordinates. For the curated target catalog, a client can choose
the documented proper-motion search estimate, whose approximation/epoch caveats remain visible.

Numeric RA, or a numeric string, defaults to degrees. Colon/hms sexagesimal RA means hours.
Explicit `ra_unit` accepts `deg` or `hourangle`; contradictory notation is rejected. Declination is
always degrees (decimal, colon or dms), including negative zero degrees. Only ICRS is accepted;
no unknown coordinate frame is silently transformed. Finite RA wraps into [0,360); poles are valid.
`POST /targets/resolve` accepts the coordinate fields alone and returns canonical ICRS degrees;
this is coordinate parsing, not a live SIMBAD name resolver.

Rectangles are north-up TAN fields, width/height independently 1–30 arcmin. A spherical enclosing
circle includes all four corners even across RA=0 or at a pole. Each returned convex ICRS footprint
is projected onto that same tangent plane and tested for rectangle intersection. A center-only cone
would miss corner-only exposures; it is not used. Unsupported footprint shapes fail explicitly.
Intersection does not promise that an image covers the whole FOV or that its pixels are usable.

Optional filters: both `start_at`/`end_at` (aware ISO timestamps, ordered, at most 730 days),
`detectors` (unique D1–D6), both `wavelength_min_um`/`wavelength_max_um` (0.7–5.5 µm).
Omit both dates to discover available epochs. `BAND` and `TIME` are sent to SIA in meters and UTC MJD;
returned rows are checked against those filters again. Detector selection filters returned rows and
therefore can leave an overflow sample empty. Narrowing dates/band is more useful in that case.

## Response and React handoff

- `canonical_query` contains normalized center, corners, requested FOV, time/band choices and registry version.
- `items` are chronological unique exposure+detector entries. Each includes immutable product ID,
  provider ID, release/calibration, original MJD strings, UTC interval, whole-image wavelength bounds,
  footprint, DOI and a validated IRSA FITS URL. `local_wavelength_um=null` means not yet measured.
- `GET /observations/{id}` returns the immutable normalized record plus original named SIA metadata.
  A metadata hash is the product ID, not a checksum of the unacquired FITS bytes.
- `availability` lists sampled epochs/detectors, detector-wide wavelength ranges and gaps between
  returned observing intervals. A gap is not proof that the archive contains no other exposure.
- `sources` retain collection, exact query URL, retrieval UTC, response SHA-256/bytes/row count,
  attempts and INFO/overflow status. Failed sources have safe error codes and partial status.
- `total` is null whenever any collection failed or overflowed/reached the row cap. `sampled_count`
  remains known. An empty partial result is `incomplete`; a complete empty query is `no_data`.
- Follow `next_page` to `GET /observations/snapshots/{uuid}?offset=...&limit=...`. All pages use the
  frozen snapshot; offset ordering never changes when fresh archive data arrives. `limit` is 1–100.
  Pagination traverses the captured sample; it cannot retrieve rows omitted by upstream overflow.

Whole-detector SIA wavelength bounds are not a local wavelength or a 102-channel availability proof.
FITS `WCS-WAVE`, masks, variance and response validation belong to step 4. No movie, moving-source
detection, photometry or scientific comparability is implied by a discovery result.

## Source registry, completeness and bounds

`GET /releases` exposes versioned QR3/QR2 wide/deep collections, adapter/PSF formats, citations and
review metadata. Future formats must opt into a validated adapter rather than silently reuse one.
The [IRSA access guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/)
documents these SIA collections and ingestion lag. SIA is sufficient for this bounded, explicitly
partial search. TAP/DataLink are not added simply to hide overflow: complete bulk ingestion/fresh
release refresh is deferred to step 10 and must have its own pagination and resource limits.

Each query selects at most four collections, **40 rows/collection**, 2 MiB decoded XML/response,
two provider connections and two attempts with 250 ms backoff. Network connect timeout is 5 seconds,
other I/O phases 10 seconds; a 25-second elapsed budget is checked during streaming. This is not a
hard process-kill deadline: a blocking network read can finish at its timeout. Two cache misses per
API process are admitted; excess receives 429/Retry-After. These are local process bounds, not a
distributed public quota system (step 3). Failed collections are explicit; all unavailable yields 503.
No upstream body/credential is returned in errors. No redirects or arbitrary source URLs are fetched.

INFO statuses are checked before and after the table. Parsing is by FIELD **name**, with required
column/unit validation and bounded TABLEDATA rows. DTD/entities, changed identities/units,
unsupported serialization, unsafe links and changed footprints fail explicitly. A returned count at
the cap is conservatively incomplete even if the provider says OK. No silent unlimited follow-up.

## Persistence and revalidation

Additive migration `cosmic_0003` adds `source_products` and `discovery_snapshots`. Existing
`observations` and analysis foreign keys are preserved. Discovery uses the new content-addressed
product IDs; a future viewer must reference them explicitly rather than treating legacy observation
UUIDs as interchangeable. Raw response bodies/FITS are not stored in these tables; normalized records,
original column values and receipts are retained. File acquisition/storage follows in step 3.

Products and snapshots are append-only in the repository. Physical identity is documented SPHEREx
obs_id + detector, distinct from release/product identity. Repeated versions are preserved, but only
one is listed per exposure: QR3 first, then numeric pipeline version/processing date, then ID for
deterministic ties. `alternate_product_ids` keeps the alternatives retrievable. Different detectors
are never merged into one exposure entry. Version preference does not certify scientific compatibility.

Search keys include normalized filters and registry version, excluding page size. A 15-minute TTL
reuses the existing snapshot. After expiry, successful revalidation creates a new snapshot; old links
stay frozen and show `stale=true`. An all-provider outage returns 503 rather than silently presenting
old results as fresh. Old snapshots can still be opened explicitly. Cache revalidation is demand-driven;
scheduled/admin refresh and retention/cleanup are later work.

Native SQLAlchemy and authenticated HTTPS PostgREST repositories implement the same lookup/save
operations. One `discovery_save` SQL function saves products and snapshot atomically, rejects changed
content under an existing product ID, and caps payload at 900,000 bytes/160 products. The restricted
role has SELECT/INSERT, without UPDATE/DELETE on discovery tables. Workers/Alembic use native SQL.
Re-run local grants after migration; production grants must be provisioned on the chosen gateway host.

## Verification

`backend/tests/test_discovery.py` covers units/wrap/poles/invalid coordinates, corner intersection,
real recorded SIA schemas, empty/error/overflow/changed-unit responses, unsafe links, retries/timeouts,
version deduplication, TTL/revalidation, snapshot pagination, outages and concurrency rejection.
The schema test checks Alembic upgrade/drift/downgrade on the disposable PostgreSQL database.

Run `python scripts/verify_discovery.py` with the local foundation stack running. It queries all five
targets, follows every returned page, verifies chronology/cache identity, then checks native/HTTPS
snapshot parity and atomic save/conflict rollback. The live report is evidence of metadata discovery,
not the phase-6 registered viewer/scientific target acceptance.
