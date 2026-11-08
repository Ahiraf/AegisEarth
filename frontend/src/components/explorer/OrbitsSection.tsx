import { useState, type CSSProperties } from "react";
import { ORBIT_OBJECTS } from "../../content/orbits";
import { FactList } from "../FactList";
import { OrbitsCanvas } from "../OrbitsCanvas";
import { Reveal } from "../Reveal";
import { SectionHeader } from "../SectionHeader";
import { SourceLink } from "../SourceLink";

export function OrbitsSection({ paused }: { paused: boolean }) {
  const [selected, setSelected] = useState(0);
  const object = ORBIT_OBJECTS[selected];
  return (
    <Reveal id="orbits">
      <SectionHeader
        eyebrow="05 / Around Earth"
        title="Satellites & space stations"
        lead="Turn the Earth, follow an orbit and discover what each spacecraft does. Choose a mission to bring its path into focus."
        chip={<span className="chip chip-plain">EXPLORE IN 3D</span>}
      />
      <div className="two orbit-layout">
        <div>
          <OrbitsCanvas
            selected={selected}
            paused={paused}
            onSelect={setSelected}
          />
          <p id="orbit-scale-note" className="note orbit-scale-note">
            Educational model, not live tracking. Heights are compressed
            logarithmically; Earth and spacecraft sizes are exaggerated. Paths
            are simplified circles with illustrative positions and orientations;
            animation is sped up. SPHEREx is shown with a simplified polar tilt.
            Reference altitudes can change.
          </p>
          <div className="orbit-reading-key">
            <h3>Read the orbit</h3>
            <dl>
              <div>
                <dt>Height</dt>
                <dd>Distance above Earth’s surface, not from its centre.</dd>
              </div>
              <div>
                <dt>Orbit time</dt>
                <dd>How long one complete trip around Earth takes.</dd>
              </div>
              <div>
                <dt>Orbit tilt</dt>
                <dd>
                  The angle of the path to Earth’s equator. A near-polar path
                  passes close to both poles.
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="orbit-details">
          <div
            className="pills orbit-pills"
            role="group"
            aria-label="Choose an orbiting object"
          >
            {ORBIT_OBJECTS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={"pill" + (index === selected ? " on" : "")}
                style={{ "--orbit-color": item.color } as CSSProperties}
                aria-pressed={index === selected}
                aria-controls="orbit-facts"
                onClick={() => setSelected(index)}
              >
                <span className="orbit-pill-dot" aria-hidden="true" />
                {item.name}
              </button>
            ))}
          </div>
          <article
            id="orbit-facts"
            className="panel orbit-facts"
            aria-live="polite"
            aria-atomic="true"
            style={{ "--orbit-color": object.color } as CSSProperties}
          >
            <span className="orbit-category">{object.category}</span>
            <h3>{object.fullName}</h3>
            <p className="orbit-summary">{object.summary}</p>
            <SourceLink
              href={object.summarySource.url}
              label={object.summarySource.name + " mission guide"}
              context={object.name}
            />
            <FactList rows={object.facts} />
            <div className="orbit-explanation">
              <h4>Why this orbit?</h4>
              <p>{object.orbitExplanation}</p>
            </div>
          </article>
          <p className="note orbit-reference">
            Agency references checked 8 November 2026. Galileo and GOES
            represent satellite families; the model shows one example of each.
          </p>
        </div>
      </div>
    </Reveal>
  );
}
