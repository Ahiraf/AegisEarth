---
title: AegisEarth API
emoji: 🔭
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

<h1 align="center">AegisEarth</h1>

<h2 align="center">See how the infrared sky changes between visits.</h2>

<p align="center">
  When SPHEREx revisits a patch of sky, what looks different?
  Choose sky coordinates and a field of view to play the archived images in date order.
  Compare a star’s position against its neighbors, inspect a change in brightness,
  and follow each frame back to its original observation.
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-20232A?style=for-the-badge&amp;logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" />
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-222222?style=for-the-badge&amp;logo=threedotjs" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-007F73?style=for-the-badge&amp;logo=fastapi&amp;logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169A1?style=for-the-badge&amp;logo=postgresql&amp;logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-1769AA?style=for-the-badge&amp;logo=docker&amp;logoColor=white" />
</p>

<p align="center"><strong><a href="https://aegisearth.vercel.app/#/explorer">Open the SPHEREx viewer ↗</a></strong></p>

<p align="center">
  <a href="#what-you-can-explore">Explore</a> ·
  <a href="#tech-stack">Tech stack</a> ·
  <a href="#run-locally">Run locally</a> ·
  <a href="#how-the-viewer-works">How it works</a> ·
  <a href="#evidence-and-limitations">Evidence and limitations</a>
</p>

> AegisEarth is an independent project by Team Infraq Stargazers. It is not affiliated with or endorsed by NASA. Its images support exploration; an apparent change is not, by itself, a validated astronomical detection.

## What you can explore

- **Your own sky field:** Search by coordinates and field size, inspect observation dates and detectors, and prepare a chronological image sequence.
- **Guided examples:** Start with archived SPHEREx images, learn how to read a sky field, or try the five challenge targets: Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, and R Draconis.
- **Images with context:** Compare frames, inspect time and quality metadata, follow provenance links, and optionally view Gaia and WISE survey context in Aladin Lite.
- **Further exploration:** Visit the interactive Planet X, spacecraft orbits, atmosphere, and Solar System pages. Those teaching scenes are illustrations, separate from the SPHEREx observation data.
- **Optional analysis:** Prepare detector views, coadds, diagnostic spectra, eligible differences, and exports. Metadata ranking can be enabled separately; image playback does not depend on it.

Observation availability varies by field, date, wavelength, and archive access. One image cannot show motion through time. The app labels saved examples separately from live search results, and scientific comparison gates remain explicit.

## Tech stack

| Layer | Technologies | Role |
| --- | --- | --- |
| Web app | React, TypeScript, Vite, Three.js, Aladin Lite | Search, playback, guided lessons, and interactive visualizations |
| API and processing | Python 3.12, FastAPI, Astropy, SciPy, Pillow | Observation discovery, image preparation, jobs, and artifact delivery |
| Data | PostgreSQL, SQLAlchemy, Alembic, local or S3-compatible artifact storage | Job state, provenance, migrations, and generated files |
| Development and checks | Docker Compose, pytest, Playwright | Reproducible local stack and backend/browser verification |

The optional main ML inference package is supplied and scientifically evaluated by the ML researcher; model training is outside this backend repository's integration work. See the [model handoff](docs/model_handoff.md) and [science validation](docs/science_ml_validation.md).

## Run locally

Install Docker Desktop or Docker Engine with Compose v2. From the repository root:

```sh
docker compose up --build --wait
```

Open [localhost:5173](http://localhost:5173) for the app and [localhost:8000/docs](http://localhost:8000/docs) for API documentation. Compose supplies local development defaults on a fresh checkout and reads an existing `.env` if present. The first build downloads images and packages; uncached observations need access to the remote archive.

```sh
docker compose logs -f api worker  # follow jobs
docker compose down                # stop without removing local data
```

To run the frontend checks separately:

```sh
cd frontend
npm ci
npm run build
npx playwright install chromium
npm run test:e2e
```

For manual backend setup and deployment details, see the [frontend integration guide](docs/frontend_integration.md) and [deployment guide](docs/deployment.md). Do not use local development credentials for a public deployment.

## How the viewer works

1. Choose a preset or enter a sky center and field of view.
2. Discover matching archive records or request a prepared sky movie.
3. Inspect the dated frames, metadata, image quality, and original source links.
4. Optionally compare views or request a diagnostic processing job.

The API queues bounded work for a separate worker and stores results with provenance. Prepared playback can be ready even when a scientific motion, brightness, or subtraction claim has not passed its validation gates. The [API contract](docs/api_contract.md), [pipeline description](docs/backend_pipeline.md), and [OpenAPI specification](docs/openapi.json) give the detailed interfaces.

## Evidence and limitations

The [five-target verification record](docs/verification/targets/README.md) documents real archive examples, empty or single-epoch outcomes, and what each result can support. The [local release report](docs/step11_release.md) records reproducible processing and browser checks. Fresh hosted data access, durability, device testing, and science-grade calibration require separate acceptance; consult the [deployment guide](docs/deployment.md) before treating a local result as a production guarantee.

SPHEREx data and original products are credited to the SPHEREx mission and NASA/IPAC IRSA. Gaia and WISE provide optional context; Aladin Lite provides the optional sky map. Individual source links and further credits are in the [source register](docs/sources_and_challenge.md) and the app's **About & Sources** page.
