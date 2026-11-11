# AegisEarth — Follow-up source quality-control pass

This pass starts from `AegisEarth_Frontend_Final_Fixed.zip`. It **does not** replace the previous redesign, change the theme, alter any backend / Python ML code, change API endpoints or request formats, rewrite scientific calculations, or remove existing features.

## Prioritized confirmed issues and corrections

| Priority | File(s) | Problem / correction |
| --- | --- | --- |
| High | `src/pages/SavedExplorerpage.tsx` | **Clear selection** left two empty comparison cards on screen. Comparison and provenance now disappear when neither observation is selected; user can reselect observations in the results table. Existing automatic A/B selection after a search is retained. |
| High | `src/features/sky/LiveExplorer.tsx`, `src/features/sky/DiscoveryResults.tsx` | Archive pagination only supported **Next records**, with no way back. Previously loaded pages are kept in frontend memory and a **Previous records** action is offered when available. Pagination failures retain current results; retry re-fetches the failed page rather than silently starting over. No endpoint/response changes. |
| High | `src/features/sky/SearchForm.tsx` | Non-submit **Find observation records** and **Share these coordinates** buttons bypassed browser validity checks for size and wavelength inputs, while numeric-field clearing could put `NaN` into a rendered number input. All three actions now validate form controls; fields in collapsed advanced options open for native validation. Empty number inputs render blank and do not send an invalid request. |
| High | `src/features/sky/SearchForm.tsx` | Input validation must **not** contradict Astropy backend handling: numeric RA may wrap past 360 and sexagesimal input may include `h/m/s` or `d/m/s`. Client syntax validation now allows these formats and leaves actual normalization to the unchanged backend. Field-of-view limits remain 1–30 arcmin; UI decimal steps no longer unnecessarily reject otherwise valid fractional values. |
| Medium | `src/pages/WorldPage.tsx`, `src/components/WorldCanvas.tsx` | The **Overview** button looked usable without a WebGL scene, and scene keyboard shortcuts intercepted keys when no scene was available. Overview now requires a ready scene; keyboard shortcuts are only handled by a ready scene. Object facts and selection remain available as before. |
| Medium | `src/features/sky/SharePanel.tsx`, `src/features/sky/LiveExplorer.tsx` | A copied-link success message could persist after requesting a different link. Share feedback now resets when link context changes. Live Explorer share requests are aborted if the component unmounts, avoiding late UI updates. |
| Medium | `src/features/sky/SearchForm.tsx` | Error feedback could persist after certain edits, and the RA/Dec hint was too terse for valid sexagesimal notation. Input edits now clear stale errors and the hints explain both accepted formats. |

## Modified source files

- `frontend/src/components/WorldCanvas.tsx`
- `frontend/src/features/sky/DiscoveryResults.tsx`
- `frontend/src/features/sky/LiveExplorer.tsx`
- `frontend/src/features/sky/SearchForm.tsx`
- `frontend/src/features/sky/SharePanel.tsx`
- `frontend/src/pages/SavedExplorerpage.tsx`
- `frontend/src/pages/WorldPage.tsx`
- `frontend/FRONTEND_QA_FOLLOWUP.md` (this report)

## Preserved functionality

Six existing hash routes, live observation discovery, saved records and previews, Aladin Lite, sky movies, comparison, spectra, image-processing and export tools, sharing, optional ML ranking / warnings, Three.js objects and controls when available, scientific data, dark theme, Manrope / JetBrains Mono, and supplied SVG favicon. None of the original tests were edited. All API paths and payload structures are unchanged.

## Verification actually executed

- `npm run typecheck`: **PASS** using the frontend's TypeScript 5.7.3, exit code 0.
- Prettier on modified TSX: **PASS**.
- `npm run build`: **BLOCKED**, after the TypeScript phase; Vite cannot load `@rollup/rollup-linux-x64-gnu` from the Windows-only dependencies in the original supplied archive.
- `npm run test:e2e`: **BLOCKED BEFORE ANY BROWSER TEST**, because Playwright's configured Vite web server fails for the same missing Rollup Linux module.
- Browser screenshot, API-integration run, responsive interaction tests and external link health: **NOT VERIFIED HERE**.

This is source-reviewed and type-checked, **not a production-certified release**.

## Development-machine verification

From the extracted `frontend/` folder (with internet or platform-correct dependencies):

```bash
npm ci
npm run typecheck
npm run build
npm run test:e2e
npm run dev
```

Verify desktop and phone views of all six routes. Specific regressions to test:

1. Live Explorer: valid decimal `360`, `-1`, and sexagesimal RA/Dec stay accepted for backend normalization; invalid field sizes block search, sharing and movie preparation. Empty numeric inputs do not cause React `NaN` warnings.
2. Discovery: search, load **Next records**, use **Previous records**, retry a failed page, and start a new search without showing obsolete pages.
3. Saved archive: search and inspect the automatically selected comparison, **Clear selection** (no empty panels), reselect A/B, and verify linked image pan/zoom.
4. Orbits, Atmosphere, Solar System: selectors show the matching fact panel; controls work when WebGL is ready and are inactive when WebGL fails; altitude and selection stay synchronized.
5. Aladin, movies, processing, sharing, optional ML ranking, exports, and source links using a live backend or the existing Playwright mocks.
6. Page layout at 1440px, 1024px, 768px, and 390px; keyboard, focus, reduced motion, contrast, and console errors.
