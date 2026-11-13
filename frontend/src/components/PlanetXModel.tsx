import { useEffect, useRef, useState } from "react";
import type {
  ModelLabel,
  ModelSettings,
  startPlanetXScene,
} from "../three/planetXScene";

type Props = ModelSettings & {
  description: string;
  onAvailable: (ready: boolean) => void;
};

export function PlanetXModel({
  view,
  playing,
  angle,
  description,
  onAvailable,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof startPlanetXScene> | null>(null);
  const settings = useRef({ view, playing, angle });
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );

  useEffect(() => {
    settings.current = { view, playing, angle };
    scene.current?.update(settings.current);
  }, [view, playing, angle]);

  useEffect(() => {
    let cancelled = false;
    function unavailable() {
      if (cancelled) return;
      scene.current?.dispose();
      scene.current = null;
      setStatus("unavailable");
      onAvailable(false);
    }
    function placeLabels(labels: ModelLabel[]) {
      const layer = overlay.current;
      if (!layer) return;
      const used: { x: number; y: number; w: number }[] = [];
      Array.from(layer.children).forEach((element, index) => {
        const node = element as HTMLSpanElement;
        const item = labels[index];
        node.hidden = !item;
        if (!item) return;
        if (node.textContent !== item.text) node.textContent = item.text;
        const w = node.offsetWidth;
        const x = Math.max(
          5,
          Math.min(layer.clientWidth - w - 5, item.x - w / 2),
        );
        let y = Math.min(layer.clientHeight - 26, Math.max(4, item.y));
        for (const other of used) {
          if (
            Math.abs(y - other.y) < 23 &&
            x < other.x + other.w + 4 &&
            other.x < x + w + 4
          ) {
            y =
              other.y + 23 < layer.clientHeight - 24
                ? other.y + 23
                : other.y - 23;
          }
        }
        used.push({ x, y, w });
        node.style.transform = `translate(${x}px, ${y}px)`;
        node.style.color = item.color;
      });
    }
    Promise.all([import("three"), import("../three/planetXScene")])
      .then(([T, module]) => {
        if (cancelled || !host.current) return;
        scene.current = module.startPlanetXScene(
          T,
          host.current,
          settings.current,
          placeLabels,
          unavailable,
        );
        setStatus("ready");
        onAvailable(true);
      })
      .catch(unavailable);
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [onAvailable]);

  const names =
    view === "spin"
      ? ["Neptune"]
      : view === "clue"
        ? ["Sun", "Neptune", "Icy world"]
        : view === "sightings"
          ? ["Sun", "Neptune", "Three imagined sightings"]
          : ["Sun", "Neptune", "Planet X · hypothetical"];
  return (
    <div className="px-stage" role="img" aria-label={description}>
      <div ref={host} className="px-canvas" aria-hidden="true" />
      <div
        ref={overlay}
        className="px-labels"
        aria-hidden="true"
        hidden={status !== "ready"}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} hidden />
        ))}
      </div>
      {status === "loading" && (
        <span className="px-loading">Opening the model…</span>
      )}
      {status === "unavailable" && (
        <div className="px-fallback">
          <small>Illustrated view · 3D unavailable</small>
          <div>
            {names.map((name) => (
              <span key={name}>
                <i data-body={name} />
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
