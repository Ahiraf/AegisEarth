import { useState, type RefObject } from "react";
import archive from "../../archive/previews.json";
import { M101 } from "../../data/irsaSnapshot";

const observations = archive.previews
  .filter(
    ({ center_icrs_deg: [ra, dec] }) =>
      ra === M101.raDeg && dec === M101.decDeg,
  )
  .sort((a, b) => a.observed_at_utc.localeCompare(b.observed_at_utc));
const pair = [observations[0], observations[observations.length - 1]];
const dates = pair.map((item) => new Date(item.observed_at_utc + "Z"));
const days = Math.round((dates[1].getTime() - dates[0].getTime()) / 86400000);
const formatDate = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function ArchivedExample({
  dialog,
  onExplore,
}: {
  onExplore?: () => void;
  dialog: RefObject<HTMLDialogElement | null>;
}) {
  const [index, setIndex] = useState(0);
  const [compared, setCompared] = useState(false);
  const [answer, setAnswer] = useState("");
  const item = pair[index];
  return (
    <dialog
      ref={dialog}
      className="archived-example"
      aria-labelledby="example-title"
      onClose={() => { setIndex(0); setCompared(false); setAnswer(""); }}
    >
      <div className="sh">
        <h2 id="example-title">The Pinwheel Galaxy</h2>
        <form method="dialog">
          <button className="btn btn-s btn-sm">Close</button>
        </form>
      </div>
      <p>
        Two archived SPHEREx observations, about {days} days apart. Switch dates
        to compare the same patch of sky.
      </p>
      <div className="tb" role="group" aria-label="Observation dates in UTC">
        {dates.map((date, i) => (
          <button
            key={date.toISOString()}
            className="explorer-filter"
            aria-pressed={i === index}
            onClick={() => { if (i !== index) setCompared(true); setIndex(i); }}
          >
            {formatDate.format(date)}
          </button>
        ))}
      </div>
      <figure>
        <div className="example-image">
          <img
            loading="lazy"
            src={import.meta.env.BASE_URL + "archive-previews/" + item.png}
            alt={`Infrared image of the Pinwheel Galaxy field on ${formatDate.format(dates[index])}`}
          />
        </div>
        <figcaption>
          The ring marks the galaxy’s catalog position. Look at the light inside
          it as you switch dates. Both images use the same brightness scale.
        </figcaption>
      </figure>
      {compared && <fieldset className="sky-fieldset">
        <legend>What changed inside the ring?</legend>
        <div className="tb">
          {["Position", "Brightness", "Hard to tell"].map(choice => (
            <button key={choice} className="btn btn-s btn-sm" aria-pressed={answer === choice} onClick={() => setAnswer(choice)}>{choice}</button>
          ))}
        </div>
        <p role="status">{answer === "Position" ? "Switch back and compare the center with nearby points. A shift shared by several points can come from image alignment." : answer === "Brightness" ? "Compare the light in the same area on both dates. The display scale is shared, but wavelength and image quality can affect how bright it looks." : answer === "Hard to tell" ? "That is a valid observation. Two images alone can leave motion or brightness changes ambiguous. More visits at similar wavelengths can help." : ""}</p>
      </fieldset>}
      <a
        className="srclink"
        href={item.source_url}
        target="_blank"
        rel="noreferrer"
      >
        Original NASA/IPAC archive image (FITS) ↗
      </a>
      {onExplore && <div className="tb"><button className="btn btn-p" onClick={() => {
        dialog.current?.close();
        onExplore();
      }}>Use this field in the viewer</button></div>}
    </dialog>
  );
}
