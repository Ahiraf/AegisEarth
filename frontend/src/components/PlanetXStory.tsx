import { useEffect, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { lessons } from "../content/planetXLessons";
import { NASA_PLANET_X } from "../content/sources";
import { PlanetXModel } from "./PlanetXModel";
import { SourceLink } from "./SourceLink";
import "../styles/planet-x.css";

export function PlanetXStory() {
  const [chapter, setChapter] = useState(0);
  const [angle, setAngle] = useState(0);
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(!reduced);
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);
  const [available, setAvailable] = useState(false);
  const lesson = lessons[chapter];
  function select(index: number) {
    setChapter(index);
    setAngle(0);
  }
  return (
    <section className="planet-story" aria-labelledby="planet-story-title">
      <header className="px-header">
        <h1 id="planet-story-title">The search for Planet X</h1>
        <p>
          Could a hidden planet shape the paths of icy worlds beyond Neptune?
          Explore the idea and the evidence it would take to find one.
        </p>
      </header>
      <div className="px-layout">
        <nav className="px-lessons" aria-label="Guided scenes">
          <h2>Guided scenes</h2>
          {lessons.map(({ name }, i) => (
            <button
              key={name}
              aria-current={i === chapter ? "step" : undefined}
              onClick={() => select(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {name}
            </button>
          ))}
        </nav>
        <figure className="px-view">
          <div className="px-window">
            <PlanetXModel
              view={lesson.view}
              playing={playing}
              angle={angle}
              description={lesson.title + " " + lesson.text}
              onAvailable={setAvailable}
            />
            <span className="px-viewname">
              {lesson.view === "spin"
                ? "Neptune close-up"
                : "Outer solar system"}
            </span>
          </div>
          <figcaption aria-live="polite">
            <div className="px-count">
              {String(chapter + 1).padStart(2, "0")}{" "}
              <span>/ {String(lessons.length).padStart(2, "0")}</span>
            </div>
            <div>
              <h2>{lesson.title}</h2>
              <p>{lesson.text}</p>
            </div>
          </figcaption>
        </figure>
        <aside className="px-controls" aria-label="Model controls">
          <h2>View controls</h2>
          <button
            className="btn btn-s"
            disabled={!available}
            onClick={() => setPlaying(!playing)}
          >
            <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
            {playing ? "Pause motion" : "Play motion"}
          </button>
          <label>
            Viewing angle <output>{angle}°</output>
            <input
              type="range"
              min="0"
              max="359"
              value={angle}
              disabled={!available}
              onChange={(e) => setAngle(e.target.valueAsNumber)}
            />
          </label>
          <div className="px-step">
            <button
              className="btn btn-s"
              aria-label="Previous scene"
              disabled={chapter === 0}
              onClick={() => select(chapter - 1)}
            >
              ←
            </button>
            <button
              className="btn btn-p"
              onClick={() => select((chapter + 1) % lessons.length)}
            >
              {chapter === lessons.length - 1 ? "Start again" : "Next scene"}{" "}
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className="px-scale">
            Bodies are enlarged and time is sped up. The size, color, and orbit
            of Planet X are imagined.
          </p>
        </aside>
      </div>
      <footer className="px-sources">
        <SourceLink href={NASA_PLANET_X.url} label="NASA’s Planet X overview" />
        <SourceLink
          href="https://science.nasa.gov/neptune/neptune-facts/"
          label="Neptune facts"
        />
        <span>
          Surface maps by{" "}
          <a href="https://www.solarsystemscope.com/textures/">
            Solar System Scope
          </a>{" "}
          · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
        </span>
      </footer>
    </section>
  );
}
