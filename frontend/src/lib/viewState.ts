// Zoom and pan state for the image viewers.

export type ViewState = { zoom: number; x: number; y: number };

export const FIT_VIEW: ViewState = { zoom: 1, x: 0, y: 0 };
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Keeps the image from being dragged outside its frame. */
export function clampView(view: ViewState, width: number, height: number): ViewState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  if (zoom === 1) return FIT_VIEW;
  const maxX = ((zoom - 1) * width) / 2;
  const maxY = ((zoom - 1) * height) / 2;
  return {
    zoom,
    x: Math.min(maxX, Math.max(-maxX, view.x)),
    y: Math.min(maxY, Math.max(-maxY, view.y)),
  };
}

/** The next zoom step above (dir = 1) or below (dir = -1) the current zoom. */
export function nextZoom(current: number, dir: 1 | -1): number {
  if (dir === 1) {
    const higher = ZOOM_STEPS.find((step) => step > current + 1e-6);
    return higher ?? MAX_ZOOM;
  }
  const lower = [...ZOOM_STEPS].reverse().find((step) => step < current - 1e-6);
  return lower ?? MIN_ZOOM;
}
