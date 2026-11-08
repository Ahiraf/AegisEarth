import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { WorldKind } from "../content/worlds";
import type { SceneLabel, WorldScene } from "../three/worldScene";

type Props = {
  kind: WorldKind;
  names: string[];
  selected: number | null;
  paused: boolean;
  altitude: number;
  onSelect: (index: number) => void;
  controls: RefObject<WorldScene | null>;
  insets: { right: number; bottom: number };
};
export function WorldCanvas({
  kind,
  names,
  selected,
  paused,
  altitude,
  onSelect,
  controls,
  insets,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLButtonElement | null)[]>([]);
  const latest = useRef({ selected, paused, altitude, onSelect, insets });
  latest.current = { selected, paused, altitude, onSelect, insets };
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [textureError, setTextureError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let scene: WorldScene | null = null;
    const unavailable = () => {
      if (cancelled) return;
      setStatus("unavailable");
      scene?.dispose();
      scene = null;
      controls.current = null;
      labels.current.forEach((label) => {
        if (label) label.hidden = true;
      });
    };
    const positionLabels = (positions: SceneLabel[]) => {
      positions.forEach((point) => {
        const label = labels.current[point.index];
        if (!label) return;
        label.hidden = !point.visible;
        label.style.left = `${point.x}px`;
        label.style.top = `${point.y}px`;
      });
    };
    Promise.all([import("three"), import("../three/worldScene")])
      .then(([THREE, module]) => {
        if (cancelled || !host.current) return;
        scene = module.startWorldScene(
          THREE,
          host.current,
          kind,
          (index) => latest.current.onSelect(index),
          positionLabels,
          unavailable,
          () => {
            if (!cancelled) setTextureError(true);
          },
        );
        controls.current = scene;
        scene.setSelected(latest.current.selected);
        scene.setPaused(latest.current.paused);
        scene.setAltitude(latest.current.altitude);
        scene.setInsets(
          latest.current.insets.right,
          latest.current.insets.bottom,
        );
        setStatus("ready");
      })
      .catch(unavailable);
    return () => {
      cancelled = true;
      scene?.dispose();
      controls.current = null;
    };
  }, [kind, controls]);
  useEffect(
    () => controls.current?.setSelected(selected),
    [selected, controls],
  );
  useEffect(() => controls.current?.setPaused(paused), [paused, controls]);
  useEffect(
    () => controls.current?.setAltitude(altitude),
    [altitude, controls],
  );
  useEffect(
    () => controls.current?.setInsets(insets.right, insets.bottom),
    [insets, controls],
  );
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const api = controls.current;
    switch (event.key) {
      case "ArrowLeft":
        api?.rotateBy(-0.15, 0);
        break;
      case "ArrowRight":
        api?.rotateBy(0.15, 0);
        break;
      case "ArrowUp":
        api?.rotateBy(0, -0.12);
        break;
      case "ArrowDown":
        api?.rotateBy(0, 0.12);
        break;
      case "+":
      case "=":
        api?.zoomBy(-1);
        break;
      case "-":
        api?.zoomBy(1);
        break;
      case "Home":
        api?.reset();
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  return (
    <div
      className="world-viewport"
      role="group"
      aria-label={`Interactive 3D ${kind === "solar" ? "Solar System" : kind === "orbits" ? "satellite orbits" : "atmosphere"}`}
      aria-describedby="world-instructions"
      tabIndex={0}
      onKeyDown={keyboard}
      data-scene-status={status}
    >
      <div className="world-render" ref={host} />
      <div className="world-labels" aria-label="Objects in the scene">
        {names.map((name, index) => (
          <button
            key={name}
            type="button"
            hidden={status !== "ready"}
            className={`world-label${selected === index ? " is-selected" : ""}`}
            aria-label={`Inspect ${name}`}
            aria-pressed={selected === index}
            ref={(el) => {
              labels.current[index] = el;
            }}
            onClick={() => onSelect(index)}
          >
            <span className="world-label-dot" aria-hidden="true" />
            {name}
          </button>
        ))}
      </div>
      {status !== "ready" && (
        <div className="world-fallback" role="status">
          <span aria-hidden="true">✦</span>
          <h2>
            {status === "loading"
              ? "Opening your window into space…"
              : "3D is unavailable in this browser"}
          </h2>
          <p>
            {status === "loading"
              ? "Preparing the scene and local texture maps."
              : "You can still choose any object above to read its facts. Try a WebGL-enabled browser for the interactive view."}
          </p>
        </div>
      )}
      {textureError && (
        <p className="world-texture-warning" role="status">
          Some surface maps could not load. Shapes and facts remain available.
        </p>
      )}
    </div>
  );
}
