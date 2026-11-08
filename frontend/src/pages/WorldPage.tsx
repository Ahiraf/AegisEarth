import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { WorldCanvas } from "../components/WorldCanvas";
import { FactList } from "../components/FactList";
import { SourceLink } from "../components/SourceLink";
import { ORBIT_OBJECTS } from "../content/orbits";
import {
  PLANETS,
  PLANET_X_SOURCE,
  planetPageUrl,
  planetFactSheetUrl,
} from "../content/planets";
import { ATMOSPHERE_LAYERS, ATMOSPHERE_SOURCE } from "../content/atmosphere";
import {
  LAYER_ALTITUDES,
  LAYER_LESSONS,
  PLANET_STORIES,
  altitudeToSlider,
  sliderToAltitude,
  layerAtAltitude,
  type WorldKind,
} from "../content/worlds";
import {
  prefersReducedMotion,
  useReducedMotion,
} from "../hooks/useReducedMotion";
import type { WorldScene } from "../three/worldScene";

const LAYERS = [...ATMOSPHERE_LAYERS].reverse();
const TITLES = {
  solar: "The Solar System",
  orbits: "Satellites & space stations",
  atmosphere: "A journey through our atmosphere",
};
const LEADS = {
  solar:
    "Eight worlds. One neighbourhood. Select a planet to take a closer look.",
  orbits:
    "Explore the spacecraft that help us live, navigate and discover above Earth.",
  atmosphere: "Travel from the air we breathe to the thin edge of space.",
};
const COLORS = ["#7be0a6", "#4cc3f0", "#7b9cff", "#b194fa", "#efb77d"];

export function WorldPage({ kind }: { kind: WorldKind }) {
  const [selected, setSelected] = useState<number | null>(
    kind === "atmosphere" ? 0 : null,
  );
  const [altitude, setAltitude] = useState(5);
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [insets, setInsets] = useState({ right: 0, bottom: 0 });
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLElement>(null);
  const chooser = useRef<HTMLSelectElement>(null);
  const controls = useRef<WorldScene | null>(null);
  const names =
    kind === "solar"
      ? PLANETS.map((p) => p.name)
      : kind === "orbits"
        ? ORBIT_OBJECTS.map((o) => o.name)
        : LAYERS.map((l) => l.name);
  const select = useCallback(
    (index: number) => {
      setSelected(index);
      if (kind === "atmosphere") setAltitude(LAYER_ALTITUDES[index]);
    },
    [kind],
  );
  const close = useCallback(() => {
    setSelected(null);
    chooser.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (reduced) setPaused(true);
  }, [reduced]);
  useEffect(() => {
    const change = () =>
      setFullscreen(document.fullscreenElement === root.current);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("fullscreenchange", change);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("keydown", escape);
    };
  }, [close]);
  useEffect(() => {
    if (selected === null || !panel.current) {
      setInsets({ right: 0, bottom: 0 });
      return;
    }
    const measure = () => {
      const bounds = panel.current?.getBoundingClientRect();
      if (!bounds) return;
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      setInsets({
        right: mobile ? 0 : bounds.width + 32,
        bottom: mobile ? bounds.height + 12 : 0,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [selected]);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
      setFullscreenError("");
    } catch {
      setFullscreenError(
        "Full-screen mode is unavailable. The scene already fills this page.",
      );
    }
  };
  const scrub = (value: number) => {
    setAltitude(value);
    setSelected(layerAtAltitude(value));
  };
  const mission =
    kind === "orbits" && selected !== null ? ORBIT_OBJECTS[selected] : null;
  const planet =
    kind === "solar" && selected !== null ? PLANETS[selected] : null;
  const layer =
    kind === "atmosphere" && selected !== null ? LAYERS[selected] : null;
  const lesson = layer && selected !== null ? LAYER_LESSONS[selected] : null;
  const displayAltitude = new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
  }).format(altitude);
  return (
    <div
      className={`world-page world-${kind}${selected !== null ? " has-detail" : ""}`}
      ref={root}
      id={kind}
    >
      <WorldCanvas
        kind={kind}
        names={names}
        selected={selected}
        paused={paused}
        altitude={altitude}
        onSelect={select}
        controls={controls}
        insets={insets}
      />
      <header className="world-heading">
        <p className="world-eyebrow">
          AegisEarth /{" "}
          {kind === "atmosphere"
            ? "Earth from the ground up"
            : "An interactive field guide"}
        </p>
        <h1>{TITLES[kind]}</h1>
        <p className="world-lead">{LEADS[kind]}</p>
        <label className="world-chooser">
          {kind === "atmosphere" ? "Explore a layer" : "Explore an object"}
          <select
            ref={chooser}
            value={selected ?? ""}
            onChange={(event) =>
              event.target.value === ""
                ? close()
                : select(Number(event.target.value))
            }
          >
            <option value="">
              {kind === "atmosphere" ? "Choose a layer…" : "Choose an object…"}
            </option>
            {names.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {kind === "atmosphere" && (
        <section
          className="altitude-lab"
          aria-label="Atmosphere altitude explorer"
        >
          <div className="altitude-readout">
            <label htmlFor="altitude-range">Your altitude</label>
            <output htmlFor="altitude-range altitude-number">
              {displayAltitude}
              <small> km</small>
            </output>
          </div>
          <input
            id="altitude-range"
            type="range"
            min="0"
            max="1000"
            step="1"
            value={altitudeToSlider(altitude)}
            aria-valuetext={`${displayAltitude} kilometres, ${LAYERS[layerAtAltitude(altitude)].name}`}
            onChange={(event) =>
              scrub(sliderToAltitude(Number(event.target.value)))
            }
          />
          <div className="altitude-endpoints">
            <span>Ground</span>
            <span>10,000 km</span>
          </div>
          <div className="altitude-entry">
            <label htmlFor="altitude-number">Go to altitude (km)</label>
            <input
              id="altitude-number"
              type="number"
              min="0"
              max="10000"
              step="any"
              value={altitude}
              onChange={(event) => {
                if (
                  event.target.value !== "" &&
                  Number.isFinite(event.target.valueAsNumber)
                )
                  scrub(
                    Math.min(10000, Math.max(0, event.target.valueAsNumber)),
                  );
              }}
            />
          </div>
          <div className="layer-steps" aria-label="Atmospheric layers">
            {LAYERS.map((item, i) => (
              <button
                key={item.name}
                type="button"
                aria-pressed={selected === i}
                onClick={() => select(i)}
                style={{ "--layer-color": COLORS[i] } as CSSProperties}
              >
                <span aria-hidden="true" />
                {item.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {selected !== null && (
        <aside
          className="world-detail"
          ref={panel}
          aria-labelledby="object-title"
          data-testid="object-details"
        >
          <button
            type="button"
            className="world-close"
            aria-label="Close object details"
            onClick={close}
          >
            ×
          </button>
          <p className="world-eyebrow">
            {mission
              ? mission.category
              : planet
                ? `World ${selected + 1} / 8`
                : `Layer ${selected + 1} / 5`}
          </p>
          <div aria-live="polite" aria-atomic="true">
            <h2 id="object-title">
              {mission?.fullName ?? planet?.name ?? layer?.name}
            </h2>
            <p className="world-description">
              {mission?.summary ??
                (planet ? PLANET_STORIES[selected] : lesson?.role)}
            </p>
          </div>
          {kind !== "atmosphere" && (
            <button
              type="button"
              className="world-action"
              onClick={() => controls.current?.focus()}
            >
              Take a closer look <span aria-hidden="true">↗</span>
            </button>
          )}
          {mission && (
            <>
              <p className="world-section-label">Mission facts</p>
              <FactList
                rows={mission.facts.map((f) => ({
                  label: f.label,
                  value: f.value,
                  source: f.source,
                }))}
              />
              <h3>Understand its orbit</h3>
              <p>{mission.orbitExplanation}</p>
              <SourceLink
                href={mission.summarySource.url}
                label="Mission reference"
                context={mission.name}
              />
            </>
          )}
          {planet && (
            <>
              <p className="world-section-label">Get to know this world</p>
              <FactList
                rows={[
                  {
                    label: "Distance from Sun",
                    value: `${planet.distanceMillionKm} million km`,
                  },
                  {
                    label: "One year",
                    value: `${planet.periodDays} Earth days (${planet.periodYears} Earth years)`,
                  },
                  { label: "Diameter", value: `${planet.diameterKm} km` },
                  { label: "Ring system", value: planet.rings },
                ]}
              />
              <h3>What am I seeing?</h3>
              <p>
                {planet.name === "Venus"
                  ? "The map shows its cloudy atmosphere, rather than the hidden rocky surface."
                  : ["Jupiter", "Saturn", "Uranus", "Neptune"].includes(
                        planet.name,
                      )
                    ? "The visible patterns belong to the upper atmosphere, rather than a solid surface."
                    : "An image-based map wraps around this globe. Lighting and rotation are illustrative."}
              </p>
              <p className="srcrow">
                <SourceLink
                  href={planetPageUrl(planet)}
                  label="NASA planet guide"
                />{" "}
                <SourceLink
                  href={planetFactSheetUrl(planet)}
                  label="NASA fact sheet"
                />
              </p>
              <p className="world-note">
                Planet X is a hypothesis, with no confirmed planet or measured
                position to show.{" "}
                <SourceLink
                  href={PLANET_X_SOURCE.url}
                  label="Read the NASA explanation"
                />
              </p>
            </>
          )}
          {layer && lesson && (
            <>
              <p className="layer-height" style={{ color: COLORS[selected] }}>
                {layer.range}
              </p>
              <p>{lesson.lesson}</p>
              <FactList
                rows={[
                  { label: "Temperature trend", value: lesson.trend },
                  { label: "Look for", value: lesson.example },
                ]}
              />
              <h3>Try this</h3>
              <p>
                Move the altitude slider or enter a height. The bright dot
                follows your altitude along the cutaway, and this guide changes
                as you cross a layer boundary.
              </p>
              <p className="world-note">
                100 km is the conventional Kármán line. It is inside the
                thermosphere, not the end of all air. Layer boundaries vary;
                these are approximate teaching ranges.
              </p>
              <SourceLink
                href={ATMOSPHERE_SOURCE.url}
                label="NASA atmosphere guide"
              />
            </>
          )}
          <p className="world-note">
            {kind === "atmosphere"
              ? "A limb cutaway with exaggerated layer thickness. Colours identify layers; they do not measure temperature or gas density."
              : kind === "orbits"
                ? "Reference orbits with compressed heights and time. Spacecraft are enlarged, illustrative models. These are not live positions."
                : "Planets are enlarged, distances compressed and orbital motion accelerated. This is an educational model, not a map of current positions."}
          </p>
        </aside>
      )}

      <div className="world-bottom">
        <p id="world-instructions">
          Drag to rotate · Choose an object for details
          <br />
          <span>Keyboard: arrow keys, + / −, Home · Ctrl + scroll to zoom</span>
        </p>
        <div className="world-toolbar" role="group" aria-label="Scene controls">
          <button
            type="button"
            onClick={() => controls.current?.rotateBy(-0.2, 0)}
            aria-label="Rotate left"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => controls.current?.rotateBy(0.2, 0)}
            aria-label="Rotate right"
          >
            ↷
          </button>
          <button
            type="button"
            onClick={() => controls.current?.zoomBy(-1)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => controls.current?.zoomBy(1)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play animation" : "Pause animation"}
          >
            {paused ? "▶" : "Ⅱ"}
            <span>{paused ? "Play" : "Pause"}</span>
          </button>
          <button type="button" onClick={() => controls.current?.reset()}>
            Overview
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            disabled={!document.fullscreenEnabled}
            aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}
          >
            ⛶<span>{fullscreen ? "Exit" : "Full screen"}</span>
          </button>
        </div>
        {fullscreenError && <p role="status">{fullscreenError}</p>}
        <p className="world-credit">
          Illustrative / not to scale ·{" "}
          <a
            href="https://www.solarsystemscope.com/textures/"
            target="_blank"
            rel="noreferrer"
          >
            Textures: Solar System Scope
          </a>{" "}
          ·{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
        </p>
      </div>
    </div>
  );
}
