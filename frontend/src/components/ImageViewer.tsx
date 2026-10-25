import { useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { FIT_VIEW, MAX_ZOOM, MIN_ZOOM, clampView, nextZoom, type ViewState } from '../lib/viewState';

type ImageViewerProps = {
  label: string;
  caption: string;
  view: ViewState;
  onViewChange: (next: ViewState) => void;
  children: ReactNode;
};

type DragState = { pointerId: number; startX: number; startY: number; originX: number; originY: number };

// A frame with zoom and pan. Nothing here moves by itself.
export function ImageViewer({ label, caption, view, onViewChange, children }: ImageViewerProps) {
  const hintId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  const apply = (next: ViewState) => {
    const rect = frameRef.current?.getBoundingClientRect();
    onViewChange(clampView(next, rect?.width ?? 0, rect?.height ?? 0));
  };
  const zoomBy = (dir: 1 | -1) => apply({ ...view, zoom: nextZoom(view.zoom, dir) });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = 32;
    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault();
        zoomBy(1);
        break;
      case '-':
      case '_':
        event.preventDefault();
        zoomBy(-1);
        break;
      case '0':
        event.preventDefault();
        onViewChange(FIT_VIEW);
        break;
      case 'ArrowLeft':
        if (view.zoom > 1) {
          event.preventDefault();
          apply({ ...view, x: view.x + step });
        }
        break;
      case 'ArrowRight':
        if (view.zoom > 1) {
          event.preventDefault();
          apply({ ...view, x: view.x - step });
        }
        break;
      case 'ArrowUp':
        if (view.zoom > 1) {
          event.preventDefault();
          apply({ ...view, y: view.y + step });
        }
        break;
      case 'ArrowDown':
        if (view.zoom > 1) {
          event.preventDefault();
          apply({ ...view, y: view.y - step });
        }
        break;
      default:
        break;
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (view.zoom <= 1) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    apply({ zoom: view.zoom, x: d.originX + (event.clientX - d.startX), y: d.originY + (event.clientY - d.startY) });
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  return (
    <div className="viewer">
      <div
        ref={frameRef}
        className={`prev${view.zoom > 1 ? ' is-zoomed' : ''}`}
        tabIndex={0}
        role="group"
        aria-label={`${label} image viewer`}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="viewer-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {children}
        </div>
        <span className="prev-caption">{caption}</span>
        <div className="viewer-tools">
          <button type="button" aria-label={`Zoom out ${label}`} disabled={view.zoom <= MIN_ZOOM} onClick={() => zoomBy(-1)}>
            {'\u2212'}
          </button>
          <button type="button" aria-label={`Zoom in ${label}`} disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomBy(1)}>
            +
          </button>
          <button type="button" aria-label={`Fit ${label} to the frame`} disabled={view.zoom === 1} onClick={() => onViewChange(FIT_VIEW)}>
            Fit
          </button>
        </div>
      </div>
      <p id={hintId} className="viewer-hint">
        Zoom {Math.round(view.zoom * 100)}%. Keys: + and {'\u2212'} zoom, arrow keys move the image when zoomed, 0 fits it.
      </p>
    </div>
  );
}
