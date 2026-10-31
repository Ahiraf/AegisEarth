# Challenge interpretation and public source register

Checked 29 October 2026. The user supplied the complete objective/background/considerations text;
it is the planning baseline. The [direct challenge URL](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/)
still returned 502 in the research tool. **Objective uncertainty is resolved by the supplied text.**
This does not verify separate submission rules, eligibility, deadline/timezone or future organizer files.

The public tool must accept RA/Dec and animate real SPHEREx sky images over time. All potential
considerations are adopted for this project's expanded release; see [coverage](challenge_alignment.md).
AI detection/ranking is optional. No organizer data package is required to begin public IRSA integration.

## Resources and verification state

“Documentation checked” is not a live adapter. Native source investigations have now run for all five
targets: [evidence packet](research/target_feasibility/README.md). Those receipts add to M101/3I data
evidence; registered viewer/scientific target recovery still remains future acceptance work.

| Primary source | Planned use | Checked state / limitations |
| --- | --- | --- |
| [SPHEREx archive access](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/) | IRSA SIA discovery; QR3/QR2 wide/deep; documented TAP fallback | Current docs identify four collections and weekly ingestion with SIA lag; real prior QR2 sample exists |
| [IRSA SIA](https://irsa.ipac.caltech.edu/SIA) and [image API docs](https://irsa.ipac.caltech.edu/docs/program_interface/api_images.html) | Bounded position/time/band queries, metadata and product URLs | Adapter still planned; inspect INFO overflow/fields and actual access_format |
| [SPHEREx products](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/) | FITS units/flags/variance, wavelength WCS, releases and calibration | Legacy QR2 inspector implemented offline; QR3 readers planned |
| [IRSA cutouts](https://irsa.ipac.caltech.edu/ibe/cutouts.html) and [official tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/) | Small server-side spatial cutouts from trusted source URLs | Three real QR2 cutouts verified previously; production lifecycle/caching planned |
| [PSF/ePSF tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-psf/) | Release-aware extraction/parent-detector mapping | Native QR3 ePSF tables and QR2 legacy cubes inspected; no empirical matching/scientific adequacy claim |
| [PSF header correction](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/psfhdrerr.html) | Identify corrected legacy QR2 headers | Earlier 6.5.7 control products avoid documented affected versions; not proof of full calibration equivalence |
| [Spectral calibration resources](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/spherex_spectral_calibrations.html) | Response functions/channel maps for grouping/composites/spectra | Documentation resource, not integrated response correction |
| [SPHEREx mission tools](https://irsa.ipac.caltech.edu/Missions/spherex.html) and [help](https://irsa.ipac.caltech.edu/onlinehelp/spherex/) | Spectrophotometry/mosaic reference and validation | Tool descriptions verified; no suitable programmatic endpoint verified. A linked mosaic application returned 404; do not build against an assumed GUI API |
| [SIMBAD via Astroquery](https://astroquery.readthedocs.io/en/latest/simbad/simbad.html) | Resolve five target identities/aliases and astrometry provenance | Five target/epoch receipts captured from official Harvard mirror after Strasbourg timeout; all explicitly J2000, original WISE seed epoch remains unknown |
| [Gaia TAP client documentation](https://astroquery.readthedocs.io/en/latest/gaia/gaia.html) | Bounded Gaia DR3 catalog context, ref_epoch/proper motion/errors | Docs checked, no live overlay queried; inspect actual schema/units, read ref_epoch rather than infer it |
| [Astropy space-motion guide](https://docs.astropy.org/en/stable/coordinates/apply_space_motion.html) | Catalog epoch propagation where supported | Use explicit time/pm conventions; simple space motion is not a complete observer-dependent apparent-position model |
| [IRSA WISE/unWISE overview](https://irsa.ipac.caltech.edu/data/WISE/unWISE/overview.html), [IRSA image server](https://irsa.ipac.caltech.edu/ibe/) and [WISE tutorials](https://caltech-ipac.github.io/irsa-tutorials/wise/) | W1/W2 image/catalog context and time-span metadata | Docs checked; old linked unWISE Program Interface returned 404. Discover valid current datasets via documented IRSA services instead of pinning that broken link |
| [Aladin Lite v3 API](https://cds-astro.github.io/aladin-lite/Aladin.html) | React sky context, FITS layers, catalog overlays and sky/pixel transforms | Current API documents displayFITS/layers; browser/CORS/orientation spike still required with frontend owner |
| [Astropy](https://docs.astropy.org/en/stable/), [Reproject](https://reproject.readthedocs.io/en/stable/), [Photutils](https://photutils.readthedocs.io/en/stable/) | Units/time/FITS/WCS, common grid and local photometry | Astropy used in existing probe; other imaging dependencies optional, science methods must be validated |
| [3I/ATLAS resource](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/) | Additional known-mover follow-up | Prior 259-row table verified; DataLink URLs/extended low-SNR comet, not a validated positive fixture or substitute for required targets |
| [HF networking/lifecycle](https://huggingface.co/docs/hub/spaces-overview#networking) | Early PostgreSQL/worker deployment feasibility | Docs restrict outbound ports to 80/443/8080 and describe sleep; don't assume 5432 works |
| [PostgREST functions](https://docs.postgrest.org/en/stable/references/api/functions.html) | Authenticated HTTPS→PostgreSQL repository route | Separate adapter/transaction RPCs tested in local TLS stack; external cloud provider remains unconfigured |

Current SPHEREx SIA collections: `spherex_qr3`, `spherex_qr3_deep`, `spherex_qr2`,
`spherex_qr2_deep`. Version this registry; QR3 and future products must not be forced through a
QR2-only PSF/HDU reader. Use source access URLs/DataLink and official calibration directories,
not guessed filenames. Nominal channel count does not guarantee per-coordinate coverage.

## Implementation choices and dependencies

- SIA is the first SPHEREx discovery adapter; add TAP for justified ingestion/completeness needs.
  Handle public metadata and cutouts without an assumed API key; enforce bounded requests/cache/backoff.
- Use current IRSA image/TAP services for WISE; do not depend on the broken legacy program link or
  confuse deep coadds/time-domain catalogs with single-epoch images.
- Start spectra with reviewed local per-epoch photometry/ePSF using available calibrated data. Assess
  official tool interoperability/reference outputs; no promise of an unverified remote spectrum endpoint.
- Query Gaia catalog context using an allowlisted bounded table/field set, not arbitrary user ADQL.
  SIMBAD/CDS is a convenience/target-curation dependency; direct coordinate input does not require it.
- Aladin belongs to React integration; backend supplies usable WCS/FITS/catalogs and fast preview
  frames. A sky-map library is not a substitute for implementing chronological playback.
- Keep framework/model choice with the researcher. Optional inference should not delay public browsing.

These are planned integrations. Do not preinstall every library or claim a third-party service supports
an endpoint until its schema/access/limits have been exercised by the relevant implementation slice.

## Use, attribution and operational limits

Keep raw request/response snapshots, retrieval UTC, hashes, product/release IDs, native units/times and
source credits. [SPHEREx mission acknowledgements](https://irsa.ipac.caltech.edu/Missions/spherex.html)
and [IRSA citation guidance](https://irsa.ipac.caltech.edu/ack.html) specify publication credits;
Gaia/CDS/WISE/unWISE/software have their own citations/licenses. Link applicable dataset DOI and
canonical papers in the public credits/export provenance. Public access does not imply a blanket
license exemption or guaranteed service uptime/rate limit. No numerical archive rate limit was established.

The [26 October research packet](research/README.md) remains a timestamped historical proof: QR2
OVERFLOW sample, empty one-field QR3 query and a small development pair. It proves neither QR3
absence generally nor five-target coverage. Its old full-brief-pending note is historical; the supplied
29 October description now resolves objective/consideration mapping while submission rules remain open.
