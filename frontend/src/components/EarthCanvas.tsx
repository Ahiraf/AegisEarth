import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { startEarthScene } from '../three/earthScene';
import type { SceneInstance } from '../three/sceneTypes';

export type SceneHandle = {
  zoomBy: (delta: number) => void;
  reset: () => void;
};

type EarthCanvasProps = {
  paused: boolean;
  controlRef: RefObject<SceneHandle | null>;
};

// Hosts the decorative 3D Earth. three.js is loaded on demand, so the rest of the page
// appears first. If WebGL is unavailable, a short message is shown instead.
export function EarthCanvas({ paused, controlRef }: EarthCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneInstance | null>(null);
  const pausedRef = useRef(paused);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
    sceneRef.current?.setPaused(paused);
  }, [paused]);

  useImperativeHandle(
    controlRef,
    () => ({
      zoomBy: (delta: number) => sceneRef.current?.zoomBy(delta),
      reset: () => sceneRef.current?.reset(),
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    import('three')
      .then((THREE) => {
        if (cancelled) return;
        try {
          sceneRef.current = startEarthScene(THREE, host, pausedRef.current);
        } catch {
          setUnavailable(true);
        }
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <>
      <div ref={hostRef} className="space" aria-hidden="true" />
      {unavailable ? (
        <div className="nogl" role="status">
          The 3D Earth could not start in this browser (WebGL is unavailable). The rest of the page works normally.
        </div>
      ) : null}
    </>
  );
}
