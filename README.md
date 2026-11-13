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

For manual backend setup and deployment details, see the [frontend integration guide](docs/frontend_integration.md) and [deployment guide](docs/deployment.md).



# AegisEarth ML: optional known-object ranker

Machine-learning part of **AegisEarth**, a public SPHEREx sky viewer built by Team Infraq Stargazers for NASA Space Apps 2026 (challenge: *Planet X and SPHEREx*). This folder documents how the ranker was built, tested and handed to the backend.

**In one sentence:** given a field of SPHEREx images and a *known* solar-system object predicted by SkyBoT, the ranker scores whether that object is really visible and moving across the frames, and attaches quality warnings.

It is an optional hint. The viewer, movie, spectra and signed-difference tools work without it. The score is a rank, not a probability. It is not a discovery tool and not a Planet X detector.

## How it works

1. IMCCE SkyBoT lists the known objects expected in the field and their predicted position in each exposure.
2. For each object brighter than V 18.1, the worker downloads native 15 arcmin cutouts of the real SPHEREx images, centred on the predicted position in each exposure.
3. The module drops frames that fail QC, keeps up to 6 frames spread across the visit, and measures the flux at the predicted position in each frame.
4. It combines the frames (S/N consistency across frames plus data-quality flags) and returns a rank, an uncertainty, warnings and a hint (`possible_motion` or `uncertain`).

Objects fainter than V 18.1 are listed but not scored: the model was not tested there.

## Data

Real SPHEREx Level-2 cutouts from NASA/IPAC IRSA (QR2 and QR3 releases, processing versions `l2b-v20` to `l2b-v27`). **No synthetic data.**

| Set | What | Size |
|---|---|---|
| First attempt | 3 ecliptic fields, SkyBoT ground truth | 386 cutouts (315 passed QC); mostly too faint to see (V about 22). Kept as a false-alert test set |
| A | 12 bright asteroids (V about 10 to 13), selected from Horizons ephemerides | 599 cutouts |
| B | 16 asteroids (V about 15 to 18.5) | 1,350 cutouts |
| **Pooled training table** | A + B after QC and the 4-frame rule | **25 asteroids, 114 real-mover tracks, 570 control tracks** |

- **Tracks:** 4 to 6 frames spread across one visit (exposures of the same sky position; a gap over 12 h starts a new visit). Cutouts are 0.25 deg (about 146 px), centred on the object's predicted position in each frame.
- **Controls (negatives):** the same frames with the path displaced by 15 to 40 px, 5 per visit. They share the data quality of the real track, so the model cannot separate them by image quality alone.
- **Real movers by magnitude:** V 8-11.5: 18, V 11.5-14.5: 6, V 14.5-16: 42, V 16-17: 37, V 17-18.5: 11.

## Method

- **Frame QC gate (fixed before looking at results):** `L2DQAFLG == Pass`, `FINAST == 0`, bad-pixel fraction <= 0.25, SOURCE fraction <= 0.90, non-NaN coverage >= 0.90.
- **Flags:** bit definitions are read from each file's `FLAGS` header (QR2 `MP_*` and QR3 `MSKN/MSKM` cards both handled), as the backend does. Every defined flag is rejected except `MP_SOURCE` and `MP_FULLSAMPLE`. Inside the aperture only, `MP_OUTLIER` pixels are tolerated, because a static-sky pipeline flags moving objects as outliers.
- **Photometry:** 2 px aperture, 5 to 9 px background annulus, native pixels, `IMAGE` used directly (no ZODI subtraction).
- **Features (14):** track S/N, S/N without the brightest frame, median per-frame S/N, fraction of frames above S/N 3, brightest-frame share, number of frames, cutout-level flag and noise statistics, aperture OUTLIER fraction and share of frames with the flag. Wavelength/time and source-overlap features were tested and not used.
- **Model:** 50 bootstrap logistic regressions (class-balanced, C = 0.5), averaged. Uncertainty is the spread across the 50. With 114 real tracks a CNN or Siamese network would overfit, so none was used.
- **Thresholds:** 5% false-alert threshold = **0.2951** (the only validated one). The 10% threshold (0.1159) was unreliable in crowded fields and is informational only.

## Results

Leave-one-asteroid-out on the pooled data (25 asteroids), 95% intervals from resampling asteroids:

| Method | AUC | Recall at 5% false alerts | False alerts at 90% recall |
|---|---|---|---|
| Rule: S/N without top frame | 0.980 | 0.85 [0.70-1.00] | 0.056 [0.018-0.098] |
| Image-only ranker | 0.975 | 0.87 [0.72-0.99] | 0.058 [0.013-0.119] |
| **Final ranker** | **0.991** | **0.96 [0.91-1.00]** | **0.016 [0.003-0.048]** |

- **Paired tests** (same resamples): false alerts at 90% recall are lower for the final ranker than for the image-only ranker (-0.037 [-0.083, -0.006]) and the simple rule (-0.035 [-0.060, -0.011]). The recall gain is only suggestive (+0.08 [0.00, +0.21] and +0.09 [-0.02, +0.23]).
- **Held-out threshold check** (threshold chosen on the other asteroids): 5% target gave recall 0.96 and 5.4% false alerts.
- **By magnitude** (recall at the 5% threshold): V 8-11.5: 1.00 (n=18), 11.5-14.5: 1.00 (n=6), 14.5-16: 1.00 (n=42), 16-17: 0.95 (n=37), 17-18.5: 0.82 (n=11).
- **By processing version:** recall v20 0.97 (n=36), v24 0.93 (n=30), v27 0.90 (n=10). Control false alerts v20 6.1%, v24 5.3%, **v27 10.0%**.
- **Crowded-field test** (original three fields, random moving paths through real frames, nothing injected; 24 visits, 360 tracks): false alerts at the 5% threshold **7.5% pooled [4.7-10.6]**, 4.2% and 4.8% in two fields and **12.6% [6.7-17.8] in the most crowded one**.

## What did not work (kept on purpose)

- First dataset: almost no detectable movers; learned models were near chance. The data selection was changed, not the model.
- A first check on the bright set gave 15.3% false alerts with closely spaced frames; selecting frames spread across the visit and pooling the sets brought it to 5.8%. The individual contributions were not separated.
- A hard "must move 4 px" gate was rejected: it removes 45% of real training tracks and does not clearly cut false alerts. `LOW_MOTION` stays a warning.
- An S/N x flag interaction feature, a static-source warning (it fired on 13% of real movers) and wavelength/time features were all rejected by rules fixed beforehand.
- Part of the performance comes from the pipeline's own OUTLIER flag at the candidate position. The ranker is not an independent detector.

## Package and usage

The deliverable is in the backend repo: `backend/model_packages/aegis_ranker_v2` (numpy and astropy only; astroquery for `candidates.py`).

| File | Purpose |
|---|---|
| `aegis_ranker/features.py` | reads native cutouts, scores a track |
| `aegis_ranker/candidates.py` | finds known objects with IMCCE SkyBoT (about 3 s per frame) |
| `ranker_AB_v3.json` | the model; SHA-256 `2171854d7a66868188d0765bb33b53e4396d75259bfe64651e1326efa7b72b37` |
| `golden/` | 13 test cases with FITS files and expected outputs |
| `MODEL_CARD.md`, `INTEGRATION.md`, `MANIFEST.json` | evidence, limits, integration steps, file hashes |

```python
import aegis_ranker.features as AF, aegis_ranker.candidates as AC
model = AF.load_model('ranker_AB_v3.json')
cands = AC.find_candidates(frames, radius_deg=0.18)    # frames: dicts with ra, dec (search centre) and mjd
# for each candidate with v_mag <= 18.1, build its frames: dict(path, ra, dec, mjd), one per exposure,
# with a 15 arcmin cutout centred on that candidate's predicted position
res = AF.rank(cand_frames, model, v_mag=c['v_mag'], version='l2b-v27')
```

Check an install: `python golden/check_golden.py ranker_AB_v3.json` (all 13 cases should print OK; tolerance 1e-6).

**Output fields:** `score` (0-1 or null; uncalibrated candidate score), `uncertainty`, `classification_hint` (`possible_motion` if the score reaches 0.2951, else `uncertain`; the model never emits `artifact` or `brightness_change`), `explanation_codes`, `warnings`, `displacement_arcsec`, `span_hours`, `frames_used`, `evidence`. A null score means "unable to score", never zero.

**Warnings:** `TOO_FEW_USABLE_FRAMES`, `FRAME_FAILED_QC`, `POSITION_NEAR_EDGE_OR_OUTSIDE`, `APERTURE_UNMEASURABLE`, `LOW_MOTION`, `APERTURE_ON_CATALOG_SOURCE` (caution, not evidence of a false alert), `PREDICTED_FAINTER_THAN_TRAINING_RANGE`, `PREDICTED_BRIGHTER_THAN_TRAINING_RANGE`, `LIMITED_VALIDATION_FOR_PROCESSING_VERSION`, `EXTRA_FRAMES_IGNORED`.

## Backend integration and status

- The backend runs the unmodified package as an optional `metadata_ranker` job (off by default; `METADATA_RANKER_ENABLED=true`). It excludes the five preset targets and never affects the viewer.
- The first live run used shared cutouts centred on the search centre. Objects drifted out of them (about 13 arcmin over a 27.8 h visit). The worker now uses per-candidate, per-exposure cutouts, as in training, and skips candidates fainter than V 18.1 before any download.
- **Corrected local acceptance run** (RA 179.88, Dec -0.64, 21-23 Dec 2025): 39 known objects, 1 bright (Massalia, V 10.9: rank 0.99999996, `possible_motion`, 8 usable frames) and 38 faint, unscored; 8 cutouts, 115.5 s. Massalia is in the training set, so this checks the flow and is not an accuracy result.
- Package checks: 58 file hashes verified, 13 golden cases pass locally and in Docker, backend suite 194 passed.

## Limitations

- Trained and tested on 25 known asteroids (V about 8 to 18.5). V 11.5-14.5 and V 17-18.5 have few real tracks; read those rows as qualitative.
- Fainter objects (V > 18.1), comets and other motion regimes are not evaluated. Known objects only: a field with no candidates does not mean nothing there moves.
- Negatives are displaced paths through real frames, not output from a candidate generator. Recall off the training magnitude range and in other fields is untested.
- False alerts are higher in crowded fields (about 1 in 8 in the most crowded test field) and for processing version v27.
- Feature choices and thresholds were selected on the same data as the reported figures; leave-one-asteroid-out reduces but does not remove this optimism.
- A fixed star tracked at constant coordinates would also score high, so candidates must move on the sky (SkyBoT objects).
- Not for the five preset targets (Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis).
- Crowded-field frames often fail QC; the module then returns warnings and no score.

## Reproduce

`notebooks/` holds the working notebook. Run it on Google Colab with a Drive folder; it needs network access to IRSA, JPL Horizons and IMCCE SkyBoT. Cutouts are regenerated by the download steps (hours); `results/` holds the small tables from the run.

| Step | What it does |
|---|---|
| First dataset | IRSA discovery, download, QC gate, SkyBoT ground truth, S/N checks on 3 fields |
| A1 | Feasibility: Horizons ephemerides plus IRSA coverage queries for bright asteroids |
| A2 / B2 | Download 0.25 deg cutouts centred on each asteroid |
| A3 / B3 | QC, photometry, track table, first comparison |
| B4 / B5 | Why movers failed (OUTLIER flag); outlier-tolerant aperture |
| B6 / B7 | Production module with parity test; operating points, paired tests, package |
| B8 to B10 | Independent bright-set check; motion-gate test |
| B11 / B12 | Pooled retraining with spread frames; final model and thresholds |
| B13 / B14 / B15 | Package v2 and `candidates.py`; crowded-field test; final package |

Random seeds are fixed in the code. Training uses scikit-learn; inference does not.


## Data and attribution

- SPHEREx data: NASA/IPAC Infrared Science Archive (IRSA). QR2: DOI 10.26131/IRSA652.
- Known-object positions: IMCCE SkyBoT (runtime, ephemeris and discovery) and JPL Horizons (training positions only).






## How the viewer works

1. Choose a preset or enter a sky center and field of view.
2. Discover matching archive records or request a prepared sky movie.
3. Inspect the dated frames, metadata, image quality, and original source links.
4. Optionally compare views or request a diagnostic processing job.

The API queues bounded work for a separate worker and stores results with provenance. Prepared playback can be ready even when a scientific motion, brightness, or subtraction claim has not passed its validation gates. The [API contract](docs/api_contract.md), [pipeline description](docs/backend_pipeline.md), and [OpenAPI specification](docs/openapi.json) .

## Evidence and limitations

The [five-target verification record](docs/verification/targets/README.md) documents real archive examples, empty or single-epoch outcomes, and what each result can support. The [local release report](docs/step11_release.md) records reproducible processing and browser checks. Fresh hosted data access, durability, device testing, and science-grade calibration require separate acceptance; consult the [deployment guide](docs/deployment.md) before treating a local result as a production guarantee.

SPHEREx data and original products are credited to the SPHEREx mission and NASA/IPAC IRSA. Gaia and WISE provide optional context; Aladin Lite provides the optional sky map. Individual source links and further credits are in the [source register](docs/sources_and_challenge.md) and the app's **About & Sources** page.
