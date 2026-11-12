import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../../hooks/useReducedMotion";
import { EarthCanvas, type SceneHandle } from "../EarthCanvas";

const WORDS = ["across time.", "in infrared.", "with context."];

// The changing word in the headline. It stops when "Pause animation" is on.
function RotatingWord({ paused }: { paused: boolean }) {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (paused) {
      setFading(false);
      return;
    }
    let swap: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setFading(true);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % WORDS.length);
        setFading(false);
      }, 360);
    }, 3200);
    return () => {
      clearInterval(timer);
      if (swap) clearTimeout(swap);
    };
  }, [paused]);

  return <span className={`rot${fading ? " out" : ""}`}>{WORDS[index]}</span>;
}

export default function LandingPage() {
  const [paused, setPaused] = useState(prefersReducedMotion);
  const earthRef = useRef<SceneHandle | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  return (
    <section className={paused ? "hero motion-paused" : "hero"} id="top" aria-labelledby="hero-title">
      <EarthCanvas
        paused={paused}
        controlRef={earthRef}
        onSceneReady={setSceneReady}
      />
      <p className="sr-only">
        A decorative comet flies past Earth. Observation images and measurements
        are available in the SPHEREx Viewer.
      </p>
      {sceneReady ? (
        <div
          className="tools"
          role="group"
          aria-label="Earth visualization controls"
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => earthRef.current?.zoomBy(-0.4)}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => earthRef.current?.zoomBy(0.4)}
          >
            {"\u2212"}
          </button>
          <button type="button" aria-pressed={paused} onClick={() => setPaused(p => !p)}>
            {paused ? "Resume animation" : "Pause animation"}
          </button>
          <button type="button" onClick={() => earthRef.current?.reset()}>
            Reset view
          </button>
        </div>
      ) : null}

      <div className="wrap hero-in">
        <div className="hero-copy">
          <p className="eyebrow">SPHEREx Observation Explorer</p>
          <h1 id="hero-title">
            <span className="sr-only">Explore the sky across time.</span>
            <span aria-hidden="true">
              Explore the sky <RotatingWord paused={paused} />
            </span>
          </h1>
          <p className="lead">
            Find real SPHEREx observations, compare images across time, and
            trace each result to the NASA/IPAC archive.
          </p>
          <div className="actions">
            <a className="btn btn-p" href="#/explorer">Start exploring</a>
          </div>
          <p className="student">
            Independent student-built exploration project by Team Infraq
            Stargazers.
          </p>
        </div>
      </div>
    </section>
  );
}
