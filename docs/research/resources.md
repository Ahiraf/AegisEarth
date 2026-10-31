# Public resource register

Historical 26 October research register. For the 29 October user-supplied full brief, five-target
protocol and expanded feature resources, use [the current source register](../sources_and_challenge.md)
and [challenge coverage](../challenge_alignment.md). Measurements/receipt claims below are preserved;
the old full-brief-pending statement reflects capture-time access, not the current planning baseline.

Verified 26 October 2026. Public IRSA resources provide the data path independently of any future
organizer resource package. No other commercial API is required for the demonstrated probe.

| Primary resource | Use and verified result | Integration decision |
| --- | --- | --- |
| [IRSA SPHEREx access guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/) | SIA/TAP metadata and archive access | SIA is sufficient for the first discovery slice; TAP is an optional documented fallback |
| [SIA endpoint](https://irsa.ipac.caltech.edu/SIA) | Bounded QR2 query returned 150 rows with OVERFLOW; QR3 exact query returned zero with OK | Record INFO status and field names; never report an overflow sample as complete |
| [Cutout interface](https://irsa.ipac.caltech.edu/ibe/cutouts.html) | Three 2-arcmin native-grid QR2 FITS cutouts successfully downloaded without authentication | Use source `access_url` plus bounded center/size parameters; do not fetch arbitrary caller URLs |
| [Official cutout tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/) | M101 target and local WCS-WAVE method | Independently inspected pinned files, rather than treating tutorial rows as observed local results |
| [SPHEREx products](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/) | Science/variance/flags/background/WCS product interpretation | Inspect actual release/HDU names; QR2 and later ePSF formats differ |
| [Explanatory Supplement](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp_QR.pdf) | Detailed release/scientific interpretation reference | Consult alongside versioned products; not a substitute for researcher review |
| [PSF header correction notice](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/psfhdrerr.html) | Version-dependent PSF-plane mapping correction | Selected 6.5.7 files are beyond affected versions |
| [PSF/ePSF tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-psf/) | Parent-detector mapping, zone selection and newer ePSF formats | Current guidance prefers newer ePSF for science; development QR2 pair needs follow-up before science release |
| [Spectral calibrations](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/spherex_spectral_calibrations.html) | Lab-derived channel maps/response functions; links to pipeline calibration assets | Locate applicable response functions at scientific-validation stage; not downloaded/equated by this interval proxy |
| [3I/ATLAS observations](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/) | Downloaded its observation VOTable: 259 rows, predicted comet coordinates, DataLink URLs | Follow-up real known-mover resource; low SNR/extended coma and compatible-epoch selection remain unresolved |
| [IRSA MOST](https://irsa.ipac.caltech.edu/Missions/spherex.html) | Mission page links the Moving Object Search Tool for known-object image searches | Optional follow-up, not called or required by this probe; no Horizons API requirement invented |

## Access, reproducibility and use

The demonstrated SIA/IBE and comet metadata requests succeeded over public HTTPS without an API
key. This is not a promise about all archive services or future policies. No numeric IRSA rate limit
was established: use sequential bounded requests, local caching and server Retry-After/backoff for
the future adapter. Handle upstream failures, truncated reads, reprocessing, retired URLs and format
changes explicitly. Do not bulk mirror full-frame data to prove a tiny cutout use case.

Raw FITS are ignored under `var/research/data_path/`; only small public metadata responses,
manifests, reports, notebook outputs and derived preview figures belong in Git. The checked-in
metadata fixture byte hashes are protected from newline conversion with `.gitattributes`.
The original comet table is `backend/tests/fixtures/observations/comet3i.vot`; its receipt records
its exact URL, timestamp and SHA-256. Its access format is DataLink, so it must not be passed
straight to a FITS parser or rewritten by guessing a filename.

For published demo material, acknowledge SPHEREx using the current wording on the
[mission page](https://irsa.ipac.caltech.edu/Missions/spherex.html) and IRSA using its
[acknowledgement/citation guidance](https://irsa.ipac.caltech.edu/ack.html). Include release/product
provenance, applicable dataset/service DOI and canonical mission/pipeline papers when appropriate.
Public download access is established; no blanket Creative Commons license or exemption from
provider acknowledgement is asserted. This research packet links those requirements; the frontend
owner must surface appropriate data credits when publishing the viewer and submission materials.

## Libraries and runtime

The local report records Python/Astropy/NumPy versions. Astropy handles FITS, units, UTC and WCS;
NumPy handles native grids and quality masks. Optional `research` dependencies add Matplotlib,
nbformat/nbclient/nbconvert/ipykernel and psutil for figures, execution and profiling. These do not
train a model and are not required by the production API image.

Photutils and Reproject remain optional planned dependencies for later detection and alignment.
The ML researcher's framework, weights, preprocessing, checksum/license and reference predictions
must arrive through the separate [model handoff](../model_handoff.md). Do not pick or train a CNN
merely to satisfy this data milestone.

## Challenge verification

The [selected challenge page](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/)
returned 502 in the browsing tool. Available official-domain summaries support public temporal
SPHEREx image exploration, but do not verify the complete rubric, resource list, deadlines or rules.
The independently demonstrated data path can proceed; full challenge/submission compliance stays
explicitly pending until the official brief is readable or organizers provide it.
