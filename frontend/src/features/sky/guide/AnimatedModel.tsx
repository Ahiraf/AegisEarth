import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import type { GuideScene } from "./targets";
import type { skyGuideScene } from "../../../three/skyGuideScene";

export function AnimatedModel({
  subject,
  description,
  fallback,
}: {
  subject: GuideScene;
  description: string;
  fallback?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const phase = useRef(0.6);
  const scene = useRef<ReturnType<typeof skyGuideScene> | null>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(!reduced);
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !host.current) return;
    const el = host.current;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    import("../../../three/skyGuideScene")
      .then(({ skyGuideScene }) => {
        if (disposed) return;
        const model = skyGuideScene(el, subject);
        scene.current = model;
        const resize = () => {
          model.resize();
          model.draw(phase.current);
        };
        resize();
        observer = new ResizeObserver(resize);
        observer.observe(el);
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      scene.current?.dispose();
      scene.current = null;
      setReady(false);
    };
  }, [visible, subject]);
  useEffect(() => {
    if (!playing || !ready || !visible) return;
    let frame = 0,
      last = 0;
    const draw = (now: number) => {
      if (now - last >= 60) {
        phase.current += (last ? Math.min(now - last, 100) : 0) * 0.00051;
        last = now;
        scene.current?.draw(phase.current);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playing, ready, visible]);
  return (
    <figure className="sg-model">
      <div
        ref={host}
        className="sg-model-stage"
        role="img"
        aria-label={description}
      >
        {failed &&
          (fallback ? (
            <img src={fallback} alt="Saved archive view of this field" />
          ) : (
            <span>3D preview unavailable</span>
          ))}
      </div>
      <figcaption>
        <span>Teaching model · time and scale simplified</span>
        <button
          type="button"
          disabled={!ready}
          className="btn btn-s btn-sm"
          aria-label={(playing ? "Pause" : "Play") + " model for " + subject}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </figcaption>
    </figure>
  );
}
