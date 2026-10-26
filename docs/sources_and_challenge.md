# Primary sources and challenge alignment

Baseline: 26 October 2026. Cosmic Motion AI is scoped around public SPHEREx image comparison,
candidate change evidence and optional validated ML ranking. This replaces the previous product scope.

## Challenge

Selected URL: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/
The direct page returned 502 in the research tool. The available official-domain summary asks for
a public tool to inspect SPHEREx sky images and understand their changes over time; see the
[Space Apps team listing](https://www.spaceappschallenge.org/2026/find-a-team/lsp26/).
The proposed compare-and-highlight workflow addresses that central objective. This is not verification
of the complete judging rubric, exact deadline, team eligibility or existing-work rules.

The frontend team must expose an actual public image comparison experience. A backend or an ML
score alone is insufficient to demonstrate that user journey. Confirm the full brief/resources and
current submission guide when accessible, and review official updates before release.

## Source register

| Source | Purpose | Implementation status |
| --- | --- | --- |
| [IRSA SPHEREx data access](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/) | SIA2/TAP metadata, product access and cutout references | Planned adapter |
| [SPHEREx data products](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/) | FITS extensions, wavelength/quality/calibration/PSF interpretation | Required research reference |
| [IRSA cutout interface](https://irsa.ipac.caltech.edu/ibe/cutouts.html) | Bounded spatial subsets of trusted source images | Planned acquisition |
| [SPHEREx overview](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/overview.html) | Observation/wavelength concepts and viewer context | Required context |
| [Astropy](https://docs.astropy.org/en/stable/) | FITS, celestial WCS, coordinates, units and explicit time scales | Dependency available; processing not implemented |
| [Photutils](https://photutils.readthedocs.io/en/stable/) | Source detection and photometry tools | Optional imaging dependency |
| [Reproject](https://reproject.readthedocs.io/en/stable/) | Celestial image reprojection | Optional imaging dependency |

IRSA documents SIA2 discovery and spatial cutout access. Collection/release names and endpoint formats
must be checked with real samples when implementing the adapter. Never build download URLs from
untrusted user text or interpret a successful zero-result query as a verified multi-epoch image pair.

## Data decisions to establish in milestone 1

- Actual real pair/sequence with overlapping sky region, usable epochs and comparable local wavelengths.
- Source time scale, precision, WCS frame and pixel-origin conventions from product metadata.
- Calibration release and correct local PSF/ePSF, quality flags, variance and background assumptions.
- Snapshot/request provenance, checksum, source terms/attribution and permitted fixture/model usage.
- Measured coverage/alignment/quality thresholds and realistic CPU/memory/storage estimates.

No real scientific fixtures or trained models are bundled in this replacement scaffold. Small synthetic
test cases are to be generated and labeled; real demo data should use a reproducible manifest and
durable permitted-use location. Keep large FITS and model weights out of Git.
