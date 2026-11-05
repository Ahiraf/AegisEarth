# AegisEarth frontend

React/TypeScript/Vite public SPHEREx sky viewer, integrated with the FastAPI backend through step 10.
The designer's existing colors, typography, cards, navigation and educational pages are retained.

From the repository root, `docker compose up --build` serves the production frontend at
http://localhost:5173 with same-origin API proxying.
For hosted Docker, the frontend listens on port 7860 as UID 1000. Set
`AEGISEARTH_API_UPSTREAM` to the public HTTPS origin of the API Space.

The saved archive comparison displays bundled PNGs for the fixed IRSA catalog. They use a common
sky grid and intensity stretch for each field, with original FITS links on each card. The preview
manifest records the exact FITS sources and hashes. To regenerate from the repository root, run
`python scripts/render_saved_archive_previews.py` in the backend environment. Add `--fetch-missing`
to retrieve any missing inputs from IRSA or its official cloud mirror.

For development:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev -- --host 127.0.0.1
```

Compare existing environment files before copying. Default API proxy: port 8000; the isolated
foundation API uses 18000. Keep `VITE_API_BASE_URL` empty for local proxying.

Checks: `npm run typecheck`, `npm run build`, `npm run test:e2e`.
Install Chromium for tests with `npx playwright install chromium`, or use installed Windows Chrome.

Read [integration/setup/feature mapping](../docs/frontend_integration.md) for routes, configuration,
cookie/CORS behavior, Docker/Hugging Face boundaries and current verification limits.
