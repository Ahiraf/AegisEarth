import { useState } from "react";
import { SourceLink } from "../../../components/SourceLink";
import { scrollToId } from "../../../lib/scroll";
import { AnimatedModel } from "./AnimatedModel";
import {
  guideFields,
  subjects,
  pinwheelBand,
  targetWidth,
  type Subject,
} from "./targets";
import type { Target } from "../types";
import "../../../styles/sky-guide.css";

const fmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dayLabel = (date: string) => fmt.format(new Date(date + "T00:00:00Z"));
const deg = (value: number) => value.toFixed(4) + "°";

function SkyAddress({ target, field }: { target: Target; field: number }) {
  // Equirectangular sky chart, with RA increasing to the left as on a sky map.
  const x = 232 - (target.ra_deg / 360) * 208,
    y = 62 - (target.dec_deg / 90) * 43;

  return (
    <figure className="sg-address">
      <svg
        viewBox="0 0 266 126"
        role="img"
        aria-label={`Sky map. Right ascension ${deg(target.ra_deg)}, declination ${deg(target.dec_deg)}.`}
      >
        <path
          d="M24 19H232V105H24Z M76 19V105 M128 19V105 M180 19V105 M24 40.5H232 M24 83.5H232"
          fill="none"
          stroke="#304859"
        />
        <path d="M24 62H232" stroke="#7c96a7" />
        <path
          d={`M232 62H${x}V${y}`}
          stroke="#78d4e5"
          fill="none"
          strokeDasharray="3 3"
        />
        <circle cx={x} cy={y} r="4" fill="#ffc777" />
        <text x="24" y="13">
          +90° north
        </text>
        <text x="238" y="66">
          0°
        </text>
        <text x="24" y="119">
          360°
        </text>
        <text x="111" y="119">
          180°
        </text>
        <text x="219" y="119">
          0°
        </text>
        <text x="168" y="13">
          RA ←
        </text>
      </svg>
      <figcaption>
        <strong>
          RA {deg(target.ra_deg)} · Dec {deg(target.dec_deg)}
        </strong>
        <br />
        Search center · {field}′ × {field}′ field
      </figcaption>
    </figure>
  );
}
function DateLesson({ dates }: { dates: string[] }) {
  const [last, setLast] = useState(dates.length - 1);
  return (
    <div className="sg-window">
      <span>Saved visit days · UTC</span>
      <div
        className="sg-visit-track"
        role="img"
        aria-label={`${last + 1} of ${dates.length} saved days inside the example window`}
      >
        {dates.map((day, i) => (
          <i key={day} className={i <= last ? "included" : ""} />
        ))}
      </div>
      <label>
        Practice end date{" "}
        <select value={last} onChange={(e) => setLast(Number(e.target.value))}>
          {dates.map((day, i) => (
            <option value={i} key={day}>
              {dayLabel(day)}
            </option>
          ))}
        </select>
      </label>
      <p aria-live="polite">
        From {dayLabel(dates[0])} through {dayLabel(dates[last])}, this example
        includes {last + 1} saved visit {last === 0 ? "day" : "days"}.
      </p>
    </div>
  );
}

export function SkyGuide({
  targets,
  onUse,
}: {
  targets?: Target[];
  onUse: (target: Target) => void;
}) {
  const [band, setBand] = useState(1);
  const [field, setField] = useState(5);
  return (
    <section className="sg" aria-labelledby="sg-title">
      <header className="sg-intro">
        <div>
          <h2 id="sg-title">What is SPHEREx looking at?</h2>
          <p>
            SPHEREx is a space telescope orbiting Earth. It scans the sky in 102
            wavelength channels, including infrared light our eyes cannot see.
            When it revisits a place, it takes another exposure.
          </p>
          <p>
            A <strong>sky movie</strong> puts those exposures in time order.
            Pick a patch of sky and look for a point that shifts, a star that
            brightens, or a pattern that stays still.
          </p>
          <div className="tb">
            <button
              type="button"
              className="btn btn-p btn-sm"
              onClick={() => scrollToId("sg-targets", true)}
            >
              Meet the six targets
            </button>
            <button
              type="button"
              className="btn btn-s btn-sm"
              onClick={() => scrollToId("find", true)}
            >
              Go to movie settings
            </button>
          </div>
          <SourceLink
            href="https://science.nasa.gov/photojournal/spherex-scans-the-sky/"
            label="See how NASA scans the sky"
          />
        </div>
        <AnimatedModel
          subject="spherex"
          description="An enlarged model of the SPHEREx telescope travels around Earth."
        />
      </header>
      <section className="sg-settings" aria-labelledby="sg-settings-title">
        <h3 id="sg-settings-title">Read the movie controls</h3>
        <div className="sg-tools">
          <div>
            <h4>Where is the camera pointing?</h4>
            <p>
              Right ascension (RA) is the angle around the sky’s equator.
              Declination (Dec) tells you how far north (+) or south (−) to
              point. Together they fix the center. Field width and height set
              the edges. An arcminute (′) is 1/60 of a degree.
            </p>
            <div
              className="sg-crop"
              role="img"
              aria-label={`A ${field}-arcminute square around the same central star`}
            >
              <i style={{ width: field * 6, height: field * 6 }} />
            </div>
            <label>
              Try a square field{" "}
              <select
                value={field}
                onChange={(e) => setField(Number(e.target.value))}
              >
                <option value={5}>5′ × 5′</option>
                <option value={10}>10′ × 10′</option>
              </select>
            </label>
          </div>
          <div>
            <h4>Which light goes into a frame?</h4>
            <p>
              Wavelength is the distance from one wave crest to the next.
              Infrared wavelengths are measured in micrometers (µm). Switch
              bands and watch the spacing between crests.
            </p>
            <svg
              viewBox="0 0 240 64"
              className="sg-wave"
              role="img"
              aria-label={`Light wave at ${band} µm`}
            >
              <path
                d={Array.from(
                  { length: 241 },
                  (_, i) =>
                    (i ? "L" : "M") +
                    i +
                    " " +
                    (32 - 18 * Math.cos((i * Math.PI) / (16 * band))).toFixed(
                      2,
                    ),
                ).join(" ")}
                fill="none"
                stroke="#efbc76"
                strokeWidth="2"
              />
            </svg>
            <label>
              Example wavelength{" "}
              <select
                value={band}
                onChange={(e) => setBand(Number(e.target.value))}
              >
                <option value={1}>1 µm</option>
                <option value={2}>2 µm</option>
                <option value={4}>4 µm</option>
              </select>
            </label>
          </div>
        </div>
        <details>
          <summary>Which spectral selection should I use?</summary>
          <dl>
            <dt>Common available wavelengths</dt>
            <dd>
              Start here. The viewer looks for visits with compatible wavelength
              coverage so brightness comparisons are easier to interpret.
            </dd>
            <dt>Choose detector</dt>
            <dd>
              Choose one of six sensors (D1–D6). Each covers a different broad
              part of the spectrum.
            </dd>
            <dt>Choose nominal channel</dt>
            <dd>
              Request one of 102 narrower wavelength bands. The archive must
              have suitable coverage at your sky position.
            </dd>
          </dl>
          <p>
            The optional minimum and maximum wavelengths narrow your search.
            Leave both empty to explore the available range.
          </p>
        </details>
        <p>
          <strong>When was the picture taken?</strong> Observation start and end
          are the first and last UTC dates you want to search. Leave both blank
          to search all available dates. Try shortening the example window under
          any target below. Each dot stands for one saved visit day.
        </p>
      </section>
      <h3 id="sg-targets">Meet the six targets</h3>
      <p className="sg-note">
        Each model shows a physical idea. The dates below come from saved
        observations of the field. Live searches may return other dates, and
        coverage alone does not confirm a detection.
      </p>
      {guideFields.map(({ target: saved, dates, sampleWavelength }) => {
        const slug = saved.slug as Subject,
          info = subjects[slug];
        const target = targets?.find((x) => x.slug === slug) ?? saved;
        return (
          <article className="sg-target" key={slug}>
            <div className="sg-target-copy">
              <span className="sg-kind">{info.kind}</span>
              <h4>{target.name}</h4>
              <p>
                <strong>{info.question}</strong> {info.text}
              </p>
              <p>{info.watch}</p>
              <div className="tb">
                <button
                  type="button"
                  className="btn btn-p btn-sm"
                  onClick={() => onUse(target)}
                >
                  Use {target.name} in my movie
                </button>
                <SourceLink
                  href={info.source}
                  label="Object reference"
                  context={target.name}
                />
              </div>
            </div>
            <AnimatedModel
              subject={slug}
              description={info.watch}
              fallback={
                slug === "m101"
                  ? undefined
                  : import.meta.env.BASE_URL +
                    "archived-targets/2026-11-01/" +
                    slug +
                    ".png"
              }
            />
            <SkyAddress target={target} field={targetWidth(target)} />
            <div>
              <DateLesson dates={dates} />
              <p className="sg-spectrum-note">
                {sampleWavelength !== null
                  ? `On ${dayLabel(dates[0])}, one saved exposure sampled about ${sampleWavelength.toFixed(2)} µm at the target position.`
                  : `The first saved visit used detector D2, which covers roughly ${pinwheelBand.minMicron}–${pinwheelBand.maxMicron} µm. Each part of its image samples a narrower band.`}
              </p>
            </div>
          </article>
        );
      })}
    </section>
  );
}
