import { useEffect, useState } from "react";
import { NASA_PLANET_X } from "../content/sources";
import { SourceLink } from "./SourceLink";

const chapters = [
  ["A clue beyond Neptune", "Look along the blue paths. These stand for icy worlds orbiting the Sun beyond Neptune. Some measured orbits point in similar directions. Astronomers have asked whether a distant planet’s gravity could help explain that pattern."],
  ["Imagine a telescope finds a dot", "In our story, observers spot a faint point where they have been searching. They return on other nights. The gold circles show three imagined sightings. From those positions they begin to predict where to look next."],
  ["A prediction comes true", "Imagine another telescope finds the object where the observers predicted. Over many visits, the measurements trace part of a path around our Sun. The dashed gold curve shows one possible full orbit. Most of that enormous journey would still lie ahead."],
  ["What would change?", "Suppose further observations established that this world was a planet. Its gravity would already have been acting for ages. What changes on discovery day is our map. Astronomers could use its measured orbit and estimated mass to test whether it explains the paths of the icy worlds."],
] as const;

// Ellipses in three spatial dimensions, with the Sun at their common focus.
// Distances and inclinations are illustrative, not fitted orbital elements.
const paths = [
  { size: 24, e: 0.01, tilt: 0, turn: 0, color: "#83baff" },
  { size: 69, e: .55, tilt: .28, turn: 2.65, color: "#54d4e2" },
  { size: 78, e: .62, tilt: -.18, turn: 2.9, color: "#54d4e2" },
  { size: 85, e: .58, tilt: .45, turn: 3.1, color: "#54d4e2" },
  { size: 119, e: .31, tilt: .38, turn: .15, color: "#ffc76b" },
];

const orbitNames = ["Neptune", "Distant object A", "Distant object B", "Distant object C", "Planet X (hypothetical)"];

function project(path: typeof paths[number], phase: number, camera: number) {
  const x = path.size * (Math.cos(phase) - path.e);
  const y = path.size * Math.sqrt(1 - path.e ** 2) * Math.sin(phase);
  const angle = path.turn + camera;
  const along = y * Math.cos(path.tilt);
  const depth = x * Math.sin(angle) + along * Math.cos(angle);
  return [190 + x * Math.cos(angle) - along * Math.sin(angle),
    106 + depth * .49 - y * Math.sin(path.tilt) * .87];
}

export function PlanetXStory() {
  const [chapter, setChapter] = useState(0);
  const [angle, setAngle] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setAngle(a => (a + 1) % 360), 60);
    return () => window.clearInterval(timer);
  }, [playing]);
  const camera = angle * Math.PI / 180;
  const [title, story] = chapters[chapter];
  return <section className="planet-story" aria-labelledby="planet-story-title">
    <div className="planet-story__layout">
      <aside className="planet-story__rail planet-story__rail--scenes" aria-label="Story scenes">
        <h1 id="planet-story-title">The search for Planet X</h1>
        <p>Could a planet beyond Neptune help explain the paths of distant icy worlds? Planet X, also called Planet Nine, is still hypothetical.</p>
        <SourceLink href={NASA_PLANET_X.url} label="NASA’s Planet X overview" />
        <h2>What if we found Planet X?</h2>
        <span className="planet-story__rail-title">Follow the evidence</span>
        {chapters.map(([scene], i) => <button key={scene} className={i === chapter ? "is-active" : ""} onClick={() => setChapter(i)}>
          <span>0{i + 1}</span>{scene}
        </button>)}
      </aside>
      <div className="planet-story__visual">
      <figure>
      <svg viewBox="0 0 380 212" role="img" aria-label={title + ". " + story}>
        {paths.map((path, i) => {
          const candidate = i === paths.length - 1;
          if (candidate && chapter === 0) return null;
          const points = Array.from({length: 121}, (_, j) => project(path, j * Math.PI / 60, camera).join(",")).join(" ");
          const [x, y] = project(path, candidate ? 2.65 : 1 + i, camera);
          return <g key={i}>
            {(!candidate || chapter >= 2) && <polyline points={points} fill="none" stroke={path.color}
              strokeWidth={candidate ? 1.5 : 1} opacity={candidate || chapter === 0 || chapter === 3 ? .9 : .4} strokeDasharray={candidate ? "4 3" : undefined} />}
            {candidate && chapter === 1 && [2.35, 2.5].map(t => {
              const [cx, cy] = project(path, t, camera);
              return <circle key={t} cx={cx} cy={cy} r="3" fill="none" stroke={path.color} />;
            })}
            <circle cx={x} cy={y} r={candidate ? 4 : 2.5} fill={path.color} />
            {(i === 0 || candidate) && <text x={x + 6} y={y - 5} fill={path.color} fontSize="6.5" fontWeight="600">{orbitNames[i]}</text>}
          </g>;
        })}
        <circle cx="190" cy="106" r="5" fill="#fff4c3" />
        <circle cx="190" cy="106" r="10" fill="none" stroke="#fff4c3" strokeOpacity=".22" />
        <text x="198" y="102" fill="#fff4c3" fontSize="8" fontWeight="600">Sun</text>
      </svg>
      <figcaption><span><b className="legend-dot legend-dot--blue" /> Neptune</span><span><b className="legend-dot legend-dot--teal" /> Measured distant objects</span><span><b className="legend-dot legend-dot--gold" /> Planet X hypothesis</span></figcaption>
    </figure>
      </div>
      <aside className="planet-story__rail planet-story__rail--controls" aria-label="Orbital controls">
        <span className="planet-story__rail-title">View the model</span>
        <button className="btn btn-s btn-sm" aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? "Pause rotation" : "Rotate in 3D"}</button>
        <label>Viewing angle <input type="range" min="0" max="359" value={angle} onChange={e => { setPlaying(false); setAngle(e.target.valueAsNumber); }} /></label>
        <div className="planet-story__scale"><strong>Not to scale</strong><span>Distances and paths are simplified so the idea is easy to see.</span></div>
        <div className="planet-story__nav"><button className="btn btn-s" disabled={chapter === 0} onClick={() => setChapter(chapter - 1)}>← Previous</button><button className="btn btn-p" onClick={() => setChapter((chapter + 1) % chapters.length)}>{chapter === 3 ? "Read again" : "Next scene →"}</button></div>
        <div aria-live="polite" className="planet-story__copy"><span className="planet-story__eyebrow">Imagined scene {chapter + 1} of 4</span><h3>{title}</h3><p>{story}</p></div>
      </aside>
    </div>
  </section>;
}
