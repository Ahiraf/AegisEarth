import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ORBIT_OBJECTS } from "../content/orbits";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { OrbitsScene } from "../three/orbitsScene";

type Props = {
  selected: number;
  paused: boolean;
  onSelect: (index: number) => void;
};

export function OrbitsCanvas({ selected, paused, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<OrbitsScene | null>(null);
  const [status, setStatus] = useState<"waiting" | "ready" | "unavailable">(
    "waiting",
  );
  const [localPause, setLocalPause] = useState(false);
  const reduced = useReducedMotion();
  const animationPaused = paused || reduced || localPause;
  const latest = useRef({ selected, animationPaused, onSelect });

  useEffect(() => {
    latest.current = { selected, animationPaused, onSelect };
    scene.current?.setSelected(selected);
    scene.current?.setPaused(animationPaused);
  }, [selected, animationPaused, onSelect]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let started = false;
    const start = async () => {
      if (started || cancelled) return;
      started = true;
      try {
        const [THREE, { startOrbitsScene }] = await Promise.all([
          import("three"),
          import("../three/orbitsScene"),
        ]);
        if (cancelled) return;
        scene.current = startOrbitsScene(
          THREE,
          element,
          ORBIT_OBJECTS,
          latest.current.selected,
          latest.current.animationPaused,
          (index) => latest.current.onSelect(index),
          () => {
            if (!cancelled) setStatus("unavailable");
          },
        );
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          void start();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || status !== "ready") return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => scene.current?.rotateBy(-0.2, 0),
      ArrowRight: () => scene.current?.rotateBy(0.2, 0),
      ArrowUp: () => scene.current?.rotateBy(0, 0.15),
      ArrowDown: () => scene.current?.rotateBy(0, -0.15),
      "+": () => scene.current?.zoomBy(-2),
      "=": () => scene.current?.zoomBy(-2),
      "-": () => scene.current?.zoomBy(2),
      Home: () => scene.current?.reset(),
    };
    if (actions[event.key]) {
      event.preventDefault();
      actions[event.key]();
    }
  };
  const unavailable = status !== "ready";
  return (
    <div className="orbit-viewer">
      <div
        className="orbit-stage"
        role="group"
        aria-label="Interactive 3D satellite orbits"
        aria-describedby="orbit-controls-help orbit-scale-note"
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-scene-status={status}
      >
        <div ref={host} className="orbit-canvas" />
        <div className="orbit-stage-heading">
          <span className="orbit-kicker">EARTH / ORBIT EXPLORER</span>
          <span className="chip chip-plain">3D MODEL</span>
        </div>
        <div className="orbit-selection" aria-hidden="true">
          <span style={{ background: ORBIT_OBJECTS[selected].color }} />
          <strong>{ORBIT_OBJECTS[selected].name}</strong>
          <small>Selected orbit</small>
        </div>
        {status === "waiting" ? (
          <p className="orbit-fallback" role="status">
            Loading the 3D orbit model…
          </p>
        ) : null}
        {status === "unavailable" ? (
          <p className="orbit-fallback" role="status">
            3D is unavailable in this browser. You can still choose every
            spacecraft and explore its facts below.
          </p>
        ) : null}
      </div>
      <div
        className="orbit-toolbar"
        role="group"
        aria-label="3D orbit view controls"
      >
        <div className="orbit-button-group">
          <button
            type="button"
            disabled={unavailable}
            aria-label="Rotate orbits left"
            onClick={() => scene.current?.rotateBy(-0.3, 0)}
          >
            ←
          </button>
          <button
            type="button"
            disabled={unavailable}
            aria-label="Rotate orbits right"
            onClick={() => scene.current?.rotateBy(0.3, 0)}
          >
            →
          </button>
          <button
            type="button"
            disabled={unavailable}
            aria-label="Tilt orbits up"
            onClick={() => scene.current?.rotateBy(0, 0.2)}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={unavailable}
            aria-label="Tilt orbits down"
            onClick={() => scene.current?.rotateBy(0, -0.2)}
          >
            ↓
          </button>
          <button
            type="button"
            disabled={unavailable}
            aria-label="Zoom in on satellite orbits"
            onClick={() => scene.current?.zoomBy(-2)}
          >
            +
          </button>
          <button
            type="button"
            disabled={unavailable}
            aria-label="Zoom out of satellite orbits"
            onClick={() => scene.current?.zoomBy(2)}
          >
            −
          </button>
        </div>
        <div className="orbit-button-group">
          <button
            className="orbit-text-control"
            type="button"
            disabled={unavailable || paused || reduced}
            aria-pressed={animationPaused}
            onClick={() => setLocalPause(!localPause)}
          >
            {paused || reduced
              ? "Motion paused"
              : localPause
                ? "Play orbits"
                : "Pause orbits"}
          </button>
          <button
            className="orbit-text-control"
            type="button"
            disabled={unavailable}
            onClick={() => scene.current?.reset()}
          >
            Reset view
          </button>
        </div>
      </div>
      <p id="orbit-controls-help" className="note orbit-help">
        Drag to turn the model. Use the buttons to tilt and zoom. Keyboard:
        focus the model, then use arrow keys, + / − and Home. Page pause and
        reduced-motion settings also apply.
      </p>
    </div>
  );
}
