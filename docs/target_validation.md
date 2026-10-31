# Required challenge targets: data and acceptance protocol

Baseline: 29 October 2026. Source/identity/native-cutout investigations have now run for all five targets;
see [the evidence packet](research/target_feasibility/README.md). Registered public-viewer acceptance
and measured motion/variability have not run. Existing M101/3I/ATLAS research remains additional evidence.

## Target matrix

| Target | Identity/coordinate acquisition | Test intent | Important limits / required evidence | Current state |
| --- | --- | --- | --- | --- |
| Barnard's Star | Verified CDS/SIMBAD identity/epoch/proper motion and source receipts | Inspect a nearby moving star over real SPHEREx epochs | Native QR3 data inspected; short baseline and target flags, no matched local-response pair in bounded sample | Source investigation done; viewer/science pending |
| Epsilon Indi B | Verified system B and separate primary catalog identity; Ba/Bb individual resolution unclaimed | Inspect the brown-dwarf pair's field and changes | QR2 D6 data inspected; no matched local-response pair in bounded sample | Source investigation done; viewer/science pending |
| WISE 0855 | Supplied coordinate kept with unknown epoch; catalog identity/J2000 epoch verified separately | Test fast-motion/faint-source behavior and wavelength selection | QR2 D6 data inspected; matched interval proxy but low contrast/common-coverage limitations; no validated detection | Source investigation done; viewer/science pending |
| RW Aurigae | Verified catalog identity/reference coordinates/proper motion | Inspect brightness changes as well as position | QR3 data inspected; response/flags differ and variability is not established | Source investigation done; viewer/science pending |
| R Draconis | Verified catalog identity/reference coordinates/proper motion | Inspect time-variable brightness | QR3 deep D1 inspected, with close wavelength pair but masked aperture/common-coverage limits | Source investigation done; viewer/science pending |

The supplied WISE coordinate converts to **RA 133.7951291667°, Dec −7.2451472222°**, calculated
with Astropy from the supplied sexagesimal strings. This conversion supplies neither a reference epoch
nor a current apparent position. Use it as the brief's search seed, retaining the original strings.
Do not assume J2000 equinox/frame labels identify a coordinate measurement's reference epoch.

## Per-target evidence record

For each target, create a versioned JSON receipt and a human-readable result after actual execution:

1. Identity/aliases, source URL/query/retrieval UTC/hash, RA/Dec/frame, reference epoch/time scale,
   pmRA convention, pmDec, positional/proper-motion uncertainty and astrometry citation when available.
2. Original supplied position and separately derived catalog/propagated positions. List missing astrometry;
   label any simple proper-motion prediction's parallax/observer-dependent apparent-position limitations.
3. Exact IRSA collection/region/FOV/time/band requests, INFO status/overflow, result counts and completeness.
   Try relevant QR3/QR2 wide/deep with coverage evidence; do not silently merge releases or duplicate epochs.
4. Selected product/release/processing IDs, original observation intervals/scale, local wavelength/response,
   detector, HDUs, PSF/ePSF, flags, bytes/hashes and all excluded-input reasons.
5. Frame grid/orientation, spectral/time grouping, stretch, coverage/registration diagnostics and previews.
   Measure motions against independent sky references; do not align on the target itself.
6. Observed behavior and uncertainty: usable display, measurable motion, brightness variation, blended,
   nondetection, insufficient epochs, unsupported quantitative processing or upstream failure.
7. Source links, frozen view/artifact IDs, run/config/library versions, operator/reviewer, date and limitations.

Keep these states separate. An archive query returning no rows is different from images existing but the
target not being detected. A usable image movie is different from statistically measured motion.

## Execution sequence and acceptance

- Resolve/pin identities and astrometry using [the source register](sources_and_challenge.md); no
  guessed catalog coordinates or aliases are stored as verified truth.
- Query the full FOV and actual observing dates. Use bounded requests and explicit continuation/overflow
  handling; broaden dates or FOV deliberately if proper motion may have carried the target away.
- Inspect small native cutouts before costly processing; select consistent local wavelengths for
  time comparison. Record QR2 legacy PSF versus QR3 ePSF assumptions rather than treating them identically.
- Build sky-fixed common-grid frames with a shared stretch. Run the actual public React player, date
  stepping, band/FOV controls, warnings and text metadata with the backend owner/frontend owner together.
- Compare source displacement/brightness evidence to astrometric/photometric uncertainties. Scientific
  thresholds come from representative controls and reviewer approval, not a desired positive result.
- Exercise expanded features where eligible: D1–D6 availability, coadd/difference, spectrum, Gaia/WISE,
  coordinate URL/iframe, exports and a fresh metadata refresh. Disabled states need actionable reasons.
- Save target-specific evidence and the reviewed outcome. Re-run after changing release, masking,
  temporal grouping, registration, response/PSF method or catalog propagation.

**Core acceptance:** all five target investigations are executed and reported; available repeat data
produces an honest movie. A nondetection can be a truthful scientific outcome, but must not be advertised
as successful visible-motion recovery. If a required target has no usable sequence, preserve the report,
investigate other dates/collections/spectral groups and make the unresolved limitation visible in the demo.

**Expanded acceptance:** every adopted consideration is implemented/tested on eligible real data plus
controlled numerical cases. No requirement to detect every object, resolve the binary, observe variability
at arbitrary dates, or generate a complete spectrum when data do not support it.
