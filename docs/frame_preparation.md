# Step 4: bands and scientifically interpretable prepared frames

Implemented locally, 31 October 2026. This slice adds **view-v2** to the existing durable job flow.
It prepares native previews, fixed-grid arrays/previews, band/quality context and operation eligibility.
Step 5 now implements [movie manifests, pagination and an isolated React handoff](movie_delivery.md). No ML package is required.

## Submit and inspect

Use the [anonymous session/idempotency workflow](views.md), then POST
[prepared_view_request.json](examples/prepared_view_request.json) to `/api/v1/views`.

```json
{
  "contract_version": "view-v2",
  "region": {"ra": 269.45, "dec": 4.76, "width_arcmin": 3, "height_arcmin": 3},
  "collections": ["spherex_qr3"],
  "max_frames": 6,
  "preparation": {
    "spectral_mode": "common_available",
    "temporal_bin_seconds": 0,
    "stretch": "shared_asinh",
    "native_preview_policy": "masked",
    "target_exclusion_radius_arcsec": 30
  }
}
```

The legacy `view-v1` contract continues to acquire native inputs only. It retains its cache identity,
one-arcminute total cutout padding and `inputs_ready` completion. New v2 jobs finish at
`frames_prepared`; this does **not** mean a movie or a scientifically confirmed detection is ready.

After success:

- `GET /views/{id}/preparation`: frozen grid/options, each native frame's units/time/release/PSF/quality/
  spectral metadata, selected group, pair rejection reasons, registration checks, temporal contributor
  records and opaque prepared artifact metadata. Match each frame's `artifact_indices` against the
  ordered report `artifacts` array. Fetch `/artifacts/{id}/content` for PNG, FITS or JSON.
- `GET /views/{id}/bands`: wavelength/nominal-window/response availability for **acquired samples**,
  including empty or unsupported measurements. It does not invent availability for 102 channels.
- `GET /bands`: all 102 official nominal channels and source/version metadata; no per-view availability
  claim. `GET /bands/{1..102}` also includes the original representative response-curve samples.

Both preparation endpoints return 404 until committed, or after expiry. Public responses and file
downloads exclude storage/fencing credentials. Existing admission, cancellation, retries, child resource
limits, persistent local/S3 storage and 24-hour input retention still apply.

## Nominal channels, local wavelengths and response limits

The catalog contains the actual **SSDC R7 July 2026** 17-per-detector summary values and both
middle-pixel/all-pixel normalized response functions, not a fabricated wavelength grid. Channels
increase from 1–17 within each detector; global numbering is 1–102. Edge channels 0/18 are excluded.
Raw signed transmission values are preserved. Source: SPHEREx calibration team, served by NASA/IPAC
IRSA at Caltech. [Official calibration page](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/spherex_spectral_calibrations.html),
[delivery documentation](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHERExSpectralFiles_202607.pdf),
[member receipts](research/calibration/receipt.json).

`capture_spectral_calibration.py` uses bounded, checked HTTP ranges to retrieve only 210 relevant
CSV members from the 436,705,280-byte archive (20,063,233 transferred bytes). Every included member
has its own SHA-256; the receipt is not falsely labeled a checksum of the full archive.
`build_channel_catalog.py` reproduces the packaged JSON from those cached, hash-verified CSVs.

IRSA explicitly distinguishes geometric channel maps, representative laboratory responses and calibrated
per-pixel wavelengths. Its [data-products guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/)
says the FITS WCS-WAVE layer is intended for **visualization**; quantitative analysis uses the pipeline
CWAVE/CBAND maps. This implementation therefore labels WCS-WAVE results as visualization proxies.
It reports native padded ranges separately from requested-output usable ranges, center-inside/center-usable state and approximate nominal-window candidates
and links to representative curves. It does not claim an exact channel-map assignment, apply R7
laboratory curves as a measured sky-pixel response or fabricate missing wavelengths.

Choose `spectral_mode="detector"` with `detector="D2"`, or `spectral_mode="channel"` with global
`channel_id=31`. Channel selection is an explicit fiducial-center/width **wavelength window**, not an
assertion that native pixels have that geometric channel-map index. Contradictory selections are 422.
Unavailable selections remain unavailable and never create synthetic bands.

## Native readers, masks and source preservation

The reader preserves scientific units, UTC observing intervals, native WCS/SIP, release/processing
identity, quality definitions, PSF/ePSF zone/row/support metadata and representative-plane hashes.
QR2 requires its PSF cube/zone mapping; QR3 requires its EPSF table. Wrong formats fail explicitly.
Original headers, calibration references, PSF data and unmodified values remain in the raw FITS artifact;
compact reports include their identities/hashes rather than losing that provenance.

The strict-flags-v1 policy keeps SOURCE and FULLSAMPLE as informational flags. It rejects all other
known flags, unknown bits, nonfinite science/wavelengths, nonpositive variance/bandwidth and missing
flag semantics. Commons are transparent/NaN where support fails. Native previews use the same mask
by default. `native_preview_policy="inspect_flagged"` explicitly exposes finite flagged native values
for inspection; it never changes the masked common planes or quantitative eligibility.

## Acquisition and common-band selection

Before bounded sampling, v2 favors observations whose SIA polygon encloses the requested footprint,
then a single release/processing-family/detector sample with good geometric support. This is a
pre-download estimate using nine TAN footprint points, not proof of usable pixels. The canonical request
records the initial/preselected/selected counts and policy; no removed epochs are silently presented as
a complete archive. The existing max-12 and source overflow limits remain explicit.

V2 requests use an enclosing cutout plus **four arcminutes total padding** (two arcminutes per edge)
for rotation and later bounded kernels. Output still covers the exact requested FOV; there is no
automatic crop to improve coverage statistics. Detector edges and masks can still leave gaps.

After reading actual acquired wavelengths, the default searches for the largest **complete-link** group:
every pair must have the same detector/release/processing family, at least 80% common usable output
coverage and at least 90% minimum local FWHM-interval overlap. These are versioned engineering display
thresholds, not a full-response equivalence proof. A chain A↔B↔C cannot admit incompatible A↔C.
All native candidates remain inspectable when this default group is small or unavailable.

## Fixed grid, variance and registration

Each common frame uses the same north-up/east-left ICRS TAN WCS. Width/height are preserved at pixel
edges, including RA wrapping and poles. Pixel counts are ceil(FOV/6.15 arcsec), with adjusted scale to
match the exact requested extent; axes remain at most 512 pixels. No target recentering is applied.

Bilinear reprojection treats pixels as surface brightness. It propagates marginal variance with
**squared interpolation coefficients** and requires all nonzero-weight contributors to be usable.
Zero-weight off-edge neighbors do not invalidate an exact boundary sample. Neighbor covariance is
not propagated, so these arrays are not silently approved for quantitative subtraction/photometry.

Registration uses S/N≥5 reference **candidates**, mutually matched within two output pixels. It excludes
the requested center's target region (default 30 arcsec, configurable 24–120). At least eight matched
candidates with spatial support are required: alternate deterministic subsets fit a median translation
and assess held-out residuals. Limits: 0.35-pixel held-out RMS, all held-out residuals ≤0.7 pixels,
translation ≤2 pixels and reference spread ≥30% of each axis. The corrected resampling is checked
again with held-out references, including a ≤0.35-pixel residual offset. Failed/insufficient support is
flagged, not replaced by correlation with the moving target. Relative registration is not an absolute
catalog astrometric solution or proof that every candidate is stationary.

The transformed WCS stays sky-fixed; the central target is never used to define its alignment. Transform,
fit/held-out counts, residuals and limitations are retained. Sparse, masked or spectrally inconsistent
fields can legitimately lack a comparable sequence while their native previews remain accessible.

## Time and display

Default temporal bins are **off**: each native observing interval remains distinct. Explicit bins are
limited to 300 seconds, anchored at the first observed interval and carry every contributor's start,
midpoint/end time and count. Long spans are split/rejected rather than disguised as short bins.
Only supported groups are combined; unsupported registration produces a reason and no averaged file.
Explicit supported display bins use an inverse-variance mean with marginal variance 1/sum(weights).
They can blur change within that requested span and are not calibrated source photometry.

Shared-asinh is the default, with the same limits/softening across the prepared inputs. The optional
`per_frame_asinh` mode is labeled. No per-epoch flux/background normalization changes the stored
science arrays. RGBA previews preserve transparency; PNG Y is flipped relative to FITS's lower-origin
array convention and this is recorded. Common FITS includes SCIENCE, VARIANCE, VALID, WAVELENGTH
and BANDWIDTH planes plus WCS/units. Original native values remain separately retrievable.

Eligibility is operation-specific: inspection/native display, masked grid display and relative comparable
sequence support are separate. Quantitative subtraction/photometry remain blocked with explicit reasons:
pipeline CWAVE/CBAND not applied, full response/PSF matching unvalidated, background/photometric
calibration unvalidated and covariance absent. Those later operations cannot be enabled by merely
having two images from one detector. No scientific motion/variability detection is claimed.

## Persistence and verification

Additive cosmic_0005 introduces prepared frame sets and a derived upload ledger. Existing views and
view-v1 data remain intact. Derived upload intents precede object PUT; raw and prepared publication
commit in one fenced transaction. Missing/expired/stale uploads roll back the entire publication.
The same result is readable through native PostgreSQL or authenticated HTTPS. Cleanup merges raw
and prepared ledgers into one ordered, bounded page; artifacts are hidden immediately on expiry.

Evidence: [five-target pinned-sample processing](verification/frame_preparation_report.json),
[live padded view-v2 job and gateway parity](verification/prepared_view_report.json). The old unpadded
target samples do not all form supported comparable sequences; failures remain in those reports.
Synthetic controls independently exercise motion exclusion, held-out registration, shared stretch,
band mismatch, exact FOV geometry, interpolation/variance, temporal averaging and transparent masks.
This is step-4 engineering acceptance, not phase-6 target recovery or public React movie acceptance.
