import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { PLANETS } from '../content/planets';
import { startSolarScene } from '../three/solarScene';
import type { SolarSceneInstance } from '../three/sceneTypes';
import type { SceneHandle } from './EarthCanvas';

type SolarCanvasProps = {
  selected: number;
  paused: boolean;
  controlRef: RefObject<SceneHandle | null>;
};

// Hosts the 3D Solar System model (loaded on demand, like the Earth).
export function SolarCanvas({ selected, paused, controlRef }: SolarCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SolarSceneInstance | null>(null);
  const latest = useRef({ selected, paused });
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    latest.current = { selected, paused };
    sceneRef.current?.setSelected(selected);
    sceneRef.current?.setPaused(paused);
  }, [selected, paused]);

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
          sceneRef.current = startSolarScene(THREE, host, PLANETS, latest.current.selected, latest.current.paused);
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
      <div ref={hostRef} className="sol-canvas" aria-hidden="true" />
      {unavailable ? (
        <p className="sol-fallback" role="status">
          The 3D model could not start in this browser (WebGL is unavailable). The planet facts still work.
        </p>
      ) : null}
    </>
  );
}
