import { useState } from "react";
import { NASA_INFRARED } from "../content/sources";
import { SourceLink } from "./SourceLink";
import { SyntheticSky } from "./SyntheticSky";

const bands = [
  {
    label: "1 µm",
    signal: 20,
    caption: "At 1 µm the marked source is fainter than the reference star.",
  },
  {
    label: "2 µm",
    signal: 80,
    caption:
      "At 2 µm the same source is brighter than the reference star. Its position is unchanged.",
  },
] as const;

export function InfraredActivity() {
  const [selected, setSelected] = useState(0);
  const band = bands[selected];
  return (
    <section className="card planet-x-guide" aria-labelledby="infrared-title">
      <h2 id="infrared-title">What changes in infrared light?</h2>
      <p>
        Infrared is light with wavelengths longer than visible red light. Keep
        the telescope on the same patch of sky and switch between two infrared
        filters. Their wavelengths are measured in micrometers (µm). Which one
        makes the marked source easier to see?
      </p>
      <div className="tb" role="group" aria-label="Infrared filter wavelength">
        {bands.map(({ label }, index) => (
          <button
            key={label}
            type="button"
            className="btn btn-s btn-sm"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            {label}
          </button>
        ))}
      </div>
      <figure className="px-infrared">
        <div className="planet-x-field">
          <SyntheticSky
            animated
            fieldSeed={9}
            noiseSeed={31}
            gain={1}
            tint="#76c6e8"
            label={`Simulated field at ${band.label}. ${band.caption}`}
          />
          <span className="px-ir-source" aria-hidden="true">
            <i style={{ opacity: band.signal / 100 }} />
            Source
          </span>
          <span className="px-ir-reference" aria-hidden="true">
            <i />
            Reference star
          </span>
        </div>
        <figcaption aria-live="polite">
          <strong>{band.caption}</strong> On this practice scale the source
          reads {band.signal} and the reference star reads 50.
        </figcaption>
      </figure>
      <p>
        Repeated visits tell you whether a dot moved. Filters tell you how much
        light arrives at different wavelengths. Here the brightness values are
        invented for practice. Planet X’s brightness is unknown.
      </p>
      <SourceLink
        href={NASA_INFRARED.url}
        label="NASA’s guide to infrared light"
      />
    </section>
  );
}
