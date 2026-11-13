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
  insets: { left: number; right: number; bottom: number };
  onSceneStatusChange?: (status: "loading" | "ready" | "unavailable") => void;
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
  onSceneStatusChange,
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
      onSceneStatusChange?.("unavailable");
      scene?.dispose();
      scene = null;
      controls.current = null;
      labels.current.forEach((label) => {
        if (label) label.hidden = true;
      });
    };
    const phone = window.matchMedia("(max-width: 760px)");
    const positionLabels = (positions: SceneLabel[]) => {
      // Reserve space for the selected label first on narrow canvases.
      const compact = phone.matches;
      const selected = latest.current.selected;
      if (compact && selected !== null) {
        positions = [...positions].sort((a, b) => Number(b.index === selected) - Number(a.index === selected));
      }
      const occupied: { x: number; y: number; width: number; height: number }[] = [];
      const width = host.current?.clientWidth ?? 0;
      const height = host.current?.clientHeight ?? 0;
      positions.forEach((point) => {
        const label = labels.current[point.index];
        if (!label) return;
        label.hidden = !point.visible;
        if (!point.visible) return;
        if (compact) {
          const w = label.offsetWidth, h = label.offsetHeight;
          const x = Math.max(2, Math.min(width - w - 2, point.x - w / 2));
          const y = Math.max(2, Math.min(height - h - 2, point.y + 6));
          if (occupied.some(box => x < box.x + box.width + 4 && box.x < x + w + 4 &&
            y < box.y + box.height + 3 && box.y < y + h + 3)) {
            label.hidden = true;
            return;
          }
          occupied.push({ x, y, width: w, height: h });
          label.style.left = `${x}px`;
          label.style.top = `${y}px`;
          return;
        }
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
          latest.current.insets.left,
          latest.current.insets.right,
          latest.current.insets.bottom,
        );
        setStatus("ready");
        onSceneStatusChange?.("ready");
      })
      .catch(unavailable);
    return () => {
      cancelled = true;
      scene?.dispose();
      controls.current = null;
    };
  }, [kind, controls, onSceneStatusChange]);
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
    () => controls.current?.setInsets(insets.left, insets.right, insets.bottom),
    [insets, controls],
  );
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const api = controls.current;
    // Do not intercept navigation keys when the WebGL scene is unavailable.
    if (!api || status !== "ready") return;
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
