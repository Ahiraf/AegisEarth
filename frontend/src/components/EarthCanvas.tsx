import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import { startEarthScene } from "../three/earthScene";
import type { SceneInstance } from "../three/sceneTypes";

export type SceneHandle = {
  zoomBy: (delta: number) => void;
  reset: () => void;
};

type EarthCanvasProps = {
  paused: boolean;
  controlRef: RefObject<SceneHandle | null>;
  onSceneReady?: (ready: boolean) => void;
};

// Hosts the decorative 3D Earth. three.js is loaded on demand, so the rest of the page
// appears first. If WebGL is unavailable, a short message is shown instead.
export function EarthCanvas({
  paused,
  controlRef,
  onSceneReady,
}: EarthCanvasProps) {
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
    import("three")
      .then((THREE) => {
        if (cancelled) return;
        try {
          sceneRef.current = startEarthScene(THREE, host, pausedRef.current);
          onSceneReady?.(true);
        } catch {
          setUnavailable(true);
          onSceneReady?.(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnavailable(true);
          onSceneReady?.(false);
        }
      });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [onSceneReady]);

  return (
    <>
      <div className="space" aria-hidden="true">
        <div ref={hostRef} className="earth-renderer" />
        {!unavailable && (
          <div className="comet-flight" style={{ animationPlayState: paused ? "paused" : "running" }}>
            <span className="comet-nucleus" />
            <span className="comet-label">Comet flyby</span>
          </div>
        )}
      </div>
      {unavailable ? (
        <div className="nogl" role="status">
          The 3D Earth could not start in this browser (WebGL is unavailable).
          The rest of the page works normally.
        </div>
      ) : null}
    </>
  );
}
