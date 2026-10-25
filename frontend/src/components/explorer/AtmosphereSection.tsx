import { ATMOSPHERE_LAYERS, ATMOSPHERE_SOURCE, ATMOSPHERE_SPACECRAFT, EDGE_OF_SPACE } from '../../content/atmosphere';
import { Reveal } from '../Reveal';
import { SectionHeader } from '../SectionHeader';
import { SourceLink } from '../SourceLink';

export function AtmosphereSection() {
  return (
    <Reveal id="atmosphere">
      <SectionHeader
        eyebrow="06 / Protective shell"
        title="Layers of Earth's atmosphere"
        lead="Earth's atmosphere has five main layers. Altitudes and descriptions below follow NASA's article, and each layer links to it."
        chip={<span className="chip chip-plain">SOURCES LINKED</span>}
      />
      <div className="two">
        <div>
          {ATMOSPHERE_LAYERS.map((layer) => (
            <div className="layer" key={layer.name} style={{ borderLeftColor: layer.color }}>
              <div>
                <h3>{layer.name}</h3>
                <small>{layer.range}</small>
              </div>
              <div>
                {layer.statements.map((text) => (
                  <p key={text}>{text}</p>
                ))}
                <p>
                  <SourceLink href={ATMOSPHERE_SOURCE.url} label="NASA source" context={layer.name} />
                </p>
              </div>
            </div>
          ))}
        </div>
        <article className="panel">
          <h3>Where spacecraft fly</h3>
          <div className="notes">
            {ATMOSPHERE_SPACECRAFT.map((item) => (
              <p key={item.title}>
                <b>{item.title}.</b> {item.text}
              </p>
            ))}
            <p><b>Edge of space.</b> {EDGE_OF_SPACE}</p>
            <p>
              <b>About these boundaries.</b> NASA gives each layer&rsquo;s limits as an average or a range. The
              troposphere, for example, is lower at the poles and higher at the equator.
            </p>
          </div>
          <p>
            <SourceLink href={ATMOSPHERE_SOURCE.url} label="NASA source" context="where spacecraft fly and the edge of space" />
          </p>
        </article>
      </div>
    </Reveal>
  );
}
