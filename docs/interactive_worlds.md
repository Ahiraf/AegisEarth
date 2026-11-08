# Independent educational pages

Explorer (`#/`), Orbits (`#/orbits`), Atmosphere (`#/atmosphere`), Solar System
(`#/solar`), Learn (`#/learn`) and About (`#/about`) mount independently. Shared
links and browser Back/Forward work. Existing Explorer URL query parameters for
coordinates and saved views are retained. Neither live nor archived Explorer
mounts the educational 3D scenes anymore.

## Viewing and interaction

The three educational scenes occupy the available viewport below the navigation.
On supported browsers the full-screen control expands the scene to the entire
display. A scene is loaded only when its page opens. Navigation disposes its GPU
resources, textures, observers, animation loop and event listeners.

Select a mesh, its projected label, or the accessible object chooser to open a
detail drawer. The drawer appears on the right on desktop and below the scene
on phones. Its close control and Escape return focus to the chooser. A close-up
control follows the selected planet or spacecraft; Overview restores the whole
scene. Drag rotates, Ctrl+wheel zooms; arrow keys, +/− and Home work when the
scene has keyboard focus. Page controls also work by keyboard. Reduced-motion
preferences start animation paused; explicit Play still allows animation. A
paused scene redraws only when something changes, including texture completion.

The five spacecraft retain eight individually sourced facts each. Earth and the
eight planets use image-based local maps. Saturn has a textured ring system;
Earth has a separate cloud layer and limb glow. Spacecraft have modelled solar
cells, trusses, modules, telescope apertures and mission-specific silhouettes.
These are authored illustrations, not CAD replicas. See
[`frontend/public/textures/README.md`](../frontend/public/textures/README.md) for
asset provenance and CC BY 4.0 attribution.

## Atmosphere explorer

An Earth globe and open limb cutaway accompany a logarithmic altitude scrubber,
numeric height entry, five layer selectors and a height marker. Teaching
boundaries are 0/12/50/80/700/10,000 km, consistent with the linked NASA overview;
boundaries in nature vary. Exactly 10,000 km remains in the exosphere display.
The 100 km Kármán convention is within the thermosphere. Layer colours are
categorical. No density, temperature or real-time atmospheric measurements are
inferred by the rendering. Layers are deliberately enlarged for visibility.

## Science and accessibility boundaries

- Positions, orbit nodes and phases are illustrative, not live ephemerides.
- Planet radii, spacecraft sizes, distances, layer thickness and time are
  rescaled. Reference numbers and source links are separate from the rendering.
- Planet X remains an unconfirmed hypothesis, described without a confirmed
  ninth-planet marker. Changing moon counts are not displayed as current facts.
- WebGL failure or context loss preserves all facts and selectors. Map-loading
  errors show a warning while keeping geometric rendering and facts available.
- The atmosphere is not a radiative-transfer, density or weather simulation.
- No backend endpoints, NASA archive processing or optional ML jobs were changed.

## Verification

Local verification on 8 November 2026: the production build passed, all 20 browser
checks passed (14 existing viewer workflows and six scene/page checks), and the
focused orbit/camera check passed again after the final zoom-limit adjustment.
Desktop and 390 × 844 phone captures were visually inspected. Full-screen entry
and exit, direct Jupiter mesh picking and all five atmosphere boundaries were
exercised in Chromium. This is local verification, not a deployed release.
Vite continues to report the existing large Three.js/Aladin vendor chunks;
both are loaded on demand.

Run `npm run build` and `npm run test:e2e` in `frontend/`. The browser suite
includes route isolation, full viewport bounds, all mission/planet drawers,
source links, direct planet mesh picking, local map loading, close-up/overview,
keyboard controls, layer boundaries, phone layouts, Back navigation, WebGL
unavailability and context loss. The existing viewer workflow suite verifies
that the backend-connected observation/movie flows still work.
