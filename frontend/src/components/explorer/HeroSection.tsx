import { useEffect, useRef, useState } from 'react';
import { scrollToId } from '../../lib/scroll';
import { EarthCanvas, type SceneHandle } from '../EarthCanvas';

type HeroSectionProps = {
  paused: boolean;
  onTogglePaused: () => void;
};

const WORDS = ['across time.', 'in infrared.', 'with context.'];

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

  return <span className={`rot${fading ? ' out' : ''}`}>{WORDS[index]}</span>;
}

export function HeroSection({ paused, onTogglePaused }: HeroSectionProps) {
  const earthRef = useRef<SceneHandle | null>(null);

  const startSearch = () => {
    scrollToId('find');
    window.setTimeout(() => document.getElementById('search-ra')?.focus({ preventScroll: true }), 450);
  };

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <EarthCanvas paused={paused} controlRef={earthRef} />
      <p className="cap">Decorative visualization, not scientific data</p>
      <div className="tools" role="group" aria-label="Earth visualization controls">
        <button type="button" aria-label="Zoom in" onClick={() => earthRef.current?.zoomBy(-0.4)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => earthRef.current?.zoomBy(0.4)}>{'\u2212'}</button>
        <button type="button" aria-pressed={paused} onClick={onTogglePaused}>
          {paused ? 'Resume animation' : 'Pause animation'}
        </button>
        <button type="button" onClick={() => earthRef.current?.reset()}>Reset view</button>
      </div>

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
            Compare SPHEREx observations of the same region of the sky, inspect their metadata, and follow every
            record back to its source in the NASA/IPAC Infrared Science Archive.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-p" onClick={startSearch}>
              Explore observations <span className="bob" aria-hidden="true">{'\u2193'}</span>
            </button>
            <a className="btn btn-s" href="#/learn">Learn how it works</a>
          </div>
          <p className="student">Independent student-built exploration project by Team Infraq Stargazers.</p>
        </div>
      </div>
    </section>
  );
}
