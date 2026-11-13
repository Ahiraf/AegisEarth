import { useRef, useState } from "react";
import { SyntheticSky } from "../components/SyntheticSky";
import { InfraredActivity } from "../components/InfraredActivity";
import { PlanetXStory } from "../components/PlanetXStory";
import { ArchivedExample } from "../features/sky/ArchivedExample";

export default function PlanetXPage() {
  const example = useRef<HTMLDialogElement>(null);
  const [later, setLater] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <article className="wrap planet-x-page">
      <PlanetXStory />
      <section className="card planet-x-guide" aria-labelledby="motion-title">
        <h2 id="motion-title">Spot motion between two visits</h2>
        <p><strong>Try it.</strong> Switch between visits. Can you find the point that changes position among the stars?</p>
        <div className="tb" role="group" aria-label="Simulated observing visit">
          <button type="button" className="btn btn-s btn-sm" aria-pressed={!later} onClick={() => setLater(false)}>First visit</button>
          <button type="button" className="btn btn-s btn-sm" aria-pressed={later} onClick={() => setLater(true)}>Second visit</button>
          <button type="button" className="btn btn-s btn-sm" aria-pressed={revealed} onClick={() => setRevealed(!revealed)}>{revealed ? "Hide the ring" : "Reveal the moving point"}</button>
        </div>
        <figure>
          <div className="planet-x-field">
            <SyntheticSky animated fieldSeed={9} noiseSeed={31} gain={1} tint="#76c6e8"
              label={!revealed ? "Simulated star field. Compare the two visits before revealing the moving point." : later ? "Simulated second visit. The marked point has shifted right relative to the stars." : "Simulated first visit. The marked point lies just left of center."} />
            <span aria-hidden="true" className="planet-x-point" style={{borderColor: revealed ? undefined : "transparent", left: later ? "53%" : "46%"}} />
          </div>
          <figcaption aria-live="polite">
            {!revealed ? (later ? "Second simulated visit." : "First simulated visit.") : later ? "Second simulated visit. The dot shifted right while the surrounding stars stayed in place. This is the kind of change astronomers follow up." : "First simulated visit. Remember where the dot sits relative to the stars around it."}
          </figcaption>
        </figure>
        <p>Astronomers return on more nights to see whether the same point keeps moving against the background stars.</p>
      </section>
      <InfraredActivity />
      <section aria-labelledby="real-images-title">
        <h2 id="real-images-title">Try real SPHEREx observations</h2>
        <p>Compare two archived images of the Pinwheel Galaxy, or open the viewer to choose your own sky field.</p>
        <div className="tb">
          <button type="button" className="btn btn-s" aria-haspopup="dialog" onClick={() => example.current?.showModal()}>Compare galaxy images</button>
          <a className="btn btn-p" href="#/explorer">Open SPHEREx Viewer</a>
        </div>
      </section>
      <ArchivedExample dialog={example} />
    </article>
  );
}
