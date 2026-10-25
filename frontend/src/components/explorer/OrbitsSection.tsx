import { useEffect, useRef, useState } from 'react';
import { ORBIT_OBJECTS } from '../../content/orbits';
import { FactList } from '../FactList';
import { Reveal } from '../Reveal';
import { SectionHeader } from '../SectionHeader';

type OrbitsSectionProps = { paused: boolean };

// Ring radius uses a logarithmic scale so that low orbits and geostationary orbit fit together.
const ringRadius = (km: number) => 36 + (210 * Math.log(km / 300)) / Math.log(120);

export function OrbitsSection({ paused }: OrbitsSectionProps) {
  const [selected, setSelected] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const object = ORBIT_OBJECTS[selected];

  // SVG animations can be paused as a group.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (paused) svg.pauseAnimations?.();
    else svg.unpauseAnimations?.();
  }, [paused]);

  return (
    <Reveal id="orbits">
      <SectionHeader
        eyebrow="05 / Around Earth"
        title="Satellites & space stations"
        lead="Choose an object to see how it orbits. Every fact has a source link beside it, so you can check it yourself."
        chip={<span className="chip chip-plain">SOURCES LINKED</span>}
      />
      <div className="two">
        <div>
          <svg
            ref={svgRef}
            className="osvg"
            viewBox="0 0 520 520"
            role="img"
            aria-label="Diagram of orbits around Earth. Use the buttons beside it to choose an object."
          >
            <circle cx="260" cy="260" r="26" fill="#0e3a66" stroke="#4CC3F0" strokeOpacity="0.6" />
            <text x="260" y="264" fill="#B8CADD" fontSize="11" textAnchor="middle">Earth</text>
            {ORBIT_OBJECTS.map((o, i) => {
              const r = ringRadius(o.placementKm);
              const on = i === selected;
              return (
                <g key={o.id}>
                  <circle cx="260" cy="260" r={r} fill="none" stroke={o.color} strokeOpacity={on ? 0.95 : 0.3} strokeWidth={on ? 2 : 1} />
                  {/* Each dot starts at its own angle so they do not pile up when paused. */}
                  <g transform={`rotate(${(i * 71) % 360} 260 260)`}>
                    <g>
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 260 260"
                        to="360 260 260"
                        dur={`${(5 * Math.sqrt(o.periodHours)).toFixed(1)}s`}
                        repeatCount="indefinite"
                      />
                      <circle cx={260 + r} cy="260" r={on ? 6 : 4} fill={o.color} />
                    </g>
                  </g>
                </g>
              );
            })}
          </svg>
          <p className="note">
            Rings are spaced on a logarithmic scale and the dots move at compressed speeds, so the diagram shows the
            order of the orbits rather than their true spacing.
          </p>
        </div>
        <div>
          <div className="pills" role="group" aria-label="Choose an orbiting object">
            {ORBIT_OBJECTS.map((o, i) => (
              <button
                key={o.id}
                type="button"
                className={`pill${i === selected ? ' on' : ''}`}
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
              >
                {o.name}
              </button>
            ))}
          </div>
          <article className="panel" aria-live="polite">
            <h3>{object.fullName}</h3>
            <FactList rows={object.facts} />
          </article>
        </div>
      </div>
    </Reveal>
  );
}
