import { useRef, useState } from 'react';
import {
  PLANETS,
  PLANET_X_FACTS,
  PLANET_X_SOURCE,
  planetFactSheetUrl,
  planetPageUrl,
} from '../../content/planets';
import { NASA_FACT_SHEET } from '../../content/sources';
import { FactList, type FactRowData } from '../FactList';
import { Reveal } from '../Reveal';
import { SectionHeader } from '../SectionHeader';
import { SolarCanvas } from '../SolarCanvas';
import type { SceneHandle } from '../EarthCanvas';
import { SourceLink } from '../SourceLink';

type SolarSectionProps = { paused: boolean };

const PLANET_X_INDEX = PLANETS.length;

export function SolarSection({ paused }: SolarSectionProps) {
  const [selected, setSelected] = useState(2); // Earth
  const sceneRef = useRef<SceneHandle | null>(null);
  const names = [...PLANETS.map((p) => p.name), 'Planet X (hypothetical)'];
  const planet = selected < PLANETS.length ? PLANETS[selected] : null;

  const rows: FactRowData[] = planet
    ? (() => {
        const source = { name: 'NASA', url: planetFactSheetUrl(planet) };
        return [
          { label: 'Distance from Sun', value: `${planet.distanceMillionKm} million km`, source },
          { label: 'Orbital period', value: `${planet.periodDays} days (${planet.periodYears} Earth years)`, source },
          { label: 'Diameter', value: `${planet.diameterKm} km`, source },
          { label: 'Moons', value: planet.moons, source },
          { label: 'Rings', value: planet.rings, source },
        ];
      })()
    : [];

  return (
    <Reveal id="solar">
      <SectionHeader
        eyebrow="07 / Our neighbourhood"
        title="The Solar System in 3D"
        lead="Drag to rotate. Zoom with the buttons (or Ctrl + wheel). In the model, distances are compressed and planets enlarged so that all of them fit on screen."
        chip={<span className="chip chip-plain">MODEL NOT TO SCALE</span>}
      />
      <div className="two">
        <div
          className="sol"
          role="group"
          aria-label="Interactive 3D model of the Solar System, not to scale. The planet facts beside it work without the model."
        >
          <SolarCanvas selected={selected} paused={paused} controlRef={sceneRef} />
          <div className="zt">
            <button type="button" aria-label="Zoom in" onClick={() => sceneRef.current?.zoomBy(-4)}>+</button>
            <button type="button" aria-label="Zoom out" onClick={() => sceneRef.current?.zoomBy(4)}>{'\u2212'}</button>
          </div>
        </div>
        <div>
          <div className="pills" role="group" aria-label="Choose a planet">
            {names.map((name, i) => (
              <button
                key={name}
                type="button"
                className={`pill${i === PLANET_X_INDEX ? ' hyp' : ''}${i === selected ? ' on' : ''}`}
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
              >
                {name}
              </button>
            ))}
          </div>
          <article className="panel" aria-live="polite">
            {planet ? (
              <>
                <h3>{planet.name}</h3>
                <FactList rows={rows} />
                <p className="note">
                  Moon counts are the ones on NASA&rsquo;s fact sheet and grow as new moons are confirmed.
                </p>
                <p className="srcrow">
                  <SourceLink href={planetPageUrl(planet)} label="NASA planet page" context={planet.name} />
                  <SourceLink href={NASA_FACT_SHEET.url} label="NASA fact sheet" context="all planets" />
                </p>
              </>
            ) : (
              <>
                <span className="badge badge-off tag">
                  <span className="badge-icon" aria-hidden="true">?</span>
                  Hypothetical, not observed
                </span>
                <h3>Planet X / Planet Nine</h3>
                <dl className="fact-list">
                  {PLANET_X_FACTS.map((fact) => (
                    <div className="fact-row" key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd><span>{fact.text}</span></dd>
                    </div>
                  ))}
                </dl>
                <p className="note">The marker in the 3D model is illustrative: its position and orbit are not measured.</p>
                <p>
                  <SourceLink href={PLANET_X_SOURCE.url} label="NASA source" context="Planet X" />
                </p>
              </>
            )}
          </article>
        </div>
      </div>
    </Reveal>
  );
}
