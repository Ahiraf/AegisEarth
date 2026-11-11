# AegisEarth — Frontend Quality Corrections

## Scope and origin

This handoff corrects the **previously redesigned `frontend/`** supplied in `AegisEarth_redesigned_frontend.zip`. Changes were restricted to frontend source, presentation and interaction logic. No backend, Python ML, API contract, model scores, ranking logic, Three.js scientific scene calculations, or other repository directories were modified. The dark palette and branding remain unchanged.

## Prioritized confirmed issues and corrections

### Critical — misleading actions and premature UI

1. **`src/features/sky/LiveExplorer.tsx` (Explorer navigation):** The three numbered workflow boxes were always displayed, even when destination sections were absent; steps 2 and 3 redirected users back to the search form. **Removed them.** Now links to observation results and prepared movies appear only when the actual results/manifest are available. The saved archive remains a real action.
2. **`src/pages/SavedExplorerpage.tsx` (saved archive):** Comparison and provenance panels appeared with no search results; a standalone placeholder claimed ML was “not connected.” **Changed:** Results appear when a search starts, comparison appears only if observations exist, provenance appears after a selection, and the nonfunctional placeholder is no longer rendered. The real optional ML ranker in live Explorer is unchanged.
3. **`src/components/EarthCanvas.tsx` + `src/components/explorer/HeroSection.tsx`:** Decorative Earth zoom/reset controls looked active when no WebGL scene existed. **Changed:** Controls render only after the scene starts; fallback messaging remains.
4. **`src/components/WorldCanvas.tsx` + `src/pages/WorldPage.tsx`:** 3D zoom/rotate/reset/focus/animation/fullscreen controls were active-looking even when WebGL was not ready. **Changed:** Scene status is surfaced to the page; scene-only controls are disabled until ready. Factual object selection still works without 3D.

### High — feedback, errors and continuity

5. **`src/features/sky/LiveExplorer.tsx` + `src/features/sky/SearchForm.tsx`:** Record search and share buttons did not reflect their own asynchronous work; a share failure was shown in the movie-submission error panel. **Changed:** Distinct searching/sharing busy labels, disabled repeat actions, and contextual share-error feedback while retaining the API request payloads and endpoints.
6. **`src/features/sky/LiveExplorer.tsx`:** Invalid saved-view UUIDs produced a generic submission error away from the field. **Changed:** Inline, accessible UUID error with `aria-invalid` and a descriptive error target.
7. **`src/pages/Explorerpage.tsx` + `src/features/sky/SharePanel.tsx`:** Switching between live Explorer and saved archive did not persist the selected mode, and live share links could open the saved archive on deployments defaulting to snapshot data. **Changed:** `?source=api` and `?source=snapshot` now persist the chosen mode; live saved-view and coordinate links explicitly identify the live Explorer. API payloads and endpoints are unchanged.
8. **`src/features/sky/SearchForm.tsx`:** Editing a preset position retained the old preset attribution note. **Changed:** Manual edits clear that note; selecting the preset continues to populate its coordinates and caveats.

### Medium — structure and text

9. **`src/features/sky/LiveExplorer.tsx`:** A second “Ready to explore” card and a large share/refresh panel were shown before the required data existed. **Changed:** Removed redundant empty-state card and delayed the share panel until a view or coordinate link exists. Search-form sharing remains available.
10. **`src/features/sky/DiscoveryResults.tsx`:** A blank warnings list could render, and headings suggested a fixed numbered sequence. **Changed:** Warnings only appear when present; heading uses the actual action name.
11. **`src/components/explorer/{SearchSection,ResultsSection,CompareSection,ProvenanceSection}.tsx`:** Saved-archive section headings implied a four-step forced sequence. **Changed:** Use descriptive labels without fake progress. Actual saved-archive search, comparison and provenance behavior is preserved.
12. **`src/styles/refinements.css`:** Styling for the removed misleading numbered boxes remained and mobile presentation lacked new contextual links. **Changed:** Deleted obsolete styles and added compact, focusable result links and disabled-scene control feedback within the existing palette.

## Exact modified source files

- `frontend/src/components/EarthCanvas.tsx`
- `frontend/src/components/WorldCanvas.tsx`
- `frontend/src/components/explorer/CompareSection.tsx`
- `frontend/src/components/explorer/HeroSection.tsx`
- `frontend/src/components/explorer/ProvenanceSection.tsx`
- `frontend/src/components/explorer/ResultsSection.tsx`
- `frontend/src/components/explorer/SearchSection.tsx`
- `frontend/src/features/sky/DiscoveryResults.tsx`
- `frontend/src/features/sky/LiveExplorer.tsx`
- `frontend/src/features/sky/SearchForm.tsx`
- `frontend/src/features/sky/SharePanel.tsx`
- `frontend/src/pages/Explorerpage.tsx`
- `frontend/src/pages/SavedExplorerpage.tsx`
- `frontend/src/pages/WorldPage.tsx`
- `frontend/src/styles/refinements.css`

## Functionality explicitly preserved

- React 19, TypeScript, Vite, hash-based navigation, the six existing routes, the dark AegisEarth palette and the supplied SVG favicon.
- Live `/api/v1/` observation discovery, saved-archive search, sky-view creation and polling, movie playback, Aladin Lite, image and spectrum tools, overlays, sharing, exports and stored views.
- Real optional known-object ML ranking, warnings and uncertainty; no frontend ranker scoring or backend-inference change.
- Three.js scene coordinates, models, orbital animation, atmospheric layer limits, planetary data, object selection, and altitude slider behavior.
- Learning material, sources, About content, scene controls when the scene is available, accessibility focus styles, and existing regression tests. No test was edited or deleted.

## Verification performed

| Command or check | Result |
|---|---|
| `npm run typecheck` | **PASS** — TypeScript build completed with exit code 0. |
| Prettier on modified files | **PASS** — files formatted. |
| SVG XML parse | **PASS** — favicon remained well formed. |
| JSX static check | **PASS** — no buttons lacking both click and form/disabled semantics in `src` (this is not a browser interaction test). |
| ZIP comparison | **PASS** — all original frontend files retained; only listed frontend source files changed. |
| `npm run build` | **BLOCKED** — Vite/Rollup fails to start because the supplied Windows-oriented `node_modules` lacks `@rollup/rollup-linux-x64-gnu` on Linux; package registry unreachable. |
| `npm run test:e2e` | **BLOCKED BEFORE EXECUTION** — Playwright's Vite web server fails for the same Rollup module; **zero browser tests ran**. |

The blocked build and e2e do **not** establish either success or failure of frontend functionality. The source passed TypeScript checks but has **not** passed browser regression testing or a production build.

## Required development-machine validation

From the extracted `frontend/` directory on a machine with internet or the appropriate platform packages installed:

```bash
npm ci
npm run typecheck
npm run build
npm run test:e2e
npm run dev
```

Manual checks should cover all six routes at ~1440px, ~1024px, ~768px and ~390px widths; both Explorer data modes; record discovery and pagination; saved-view loading and sharing; missing-backend failure states; optional known-object ranker; Three.js selection, zoom, reset and fullscreen; atmosphere layer boundary transitions; Learn chapter links; About source links; keyboard access and console warnings. A live backend is needed to verify actual external API workflows beyond existing mocks.

## Remaining caveats

- No actual screenshots or rendered cross-device layout checks were possible without a running Vite dev server.
- External link health has not been checked against remote sites.
- No new backend behavior was implemented or required.
- The unchanged `ModelSection.tsx` file still contains legacy placeholder text in source, but is **not rendered** by the saved-archive route; the working live ranker continues to be available through `MetadataRanker.tsx`.
