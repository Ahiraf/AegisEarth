import "../styles/orbits-experience.css";
import "../styles/world-experience.css";
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
import { PLANET_PROFILES } from "../content/planetProfiles";
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
const COLORS = ["#7be0a6", "#4cc3f0", "#7b9cff", "#b194fa", "#efb77d"];
const TITLES: Record<WorldKind, string> = {
  orbits: "Satellites & space stations",
  atmosphere: "Earth's atmosphere",
  solar: "The Solar System",
};
const LEADS: Record<WorldKind, string> = {
  orbits:
    "Discover five missions in Earth orbit. Select a spacecraft to explore its purpose and reference path.",
  atmosphere:
    "Follow the air above our world, from the weather layer to the edge of interplanetary space.",
  solar:
    "Eight planets, one star. Explore the worlds of our Solar System through an interactive model.",
};
const DEFAULT_SELECTION: Record<WorldKind, number> = {
  orbits: 0, // The International Space Station introduces the mission directory.
  atmosphere: 0, // Troposphere is the natural starting point for an ascent.
  solar: 2, // Start at Earth; retain the full-system overview camera.
};
const COUNT: Record<WorldKind, string> = {
  orbits: "05 missions",
  atmosphere: "05 layers",
  solar: "08 planets",
};

export function WorldPage({ kind }: { kind: WorldKind }) {
  // Desktop profiles open as an introduction; on phones the scene remains unobstructed
  // until the visitor explicitly chooses a mission, planet, or atmospheric layer.
  const [selected, setSelected] = useState<number | null>(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 760px)").matches
      ? null
      : DEFAULT_SELECTION[kind],
  );
  const [altitude, setAltitude] = useState(5);
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [sceneStatus, setSceneStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [insets, setInsets] = useState({ left: 0, right: 0, bottom: 0 });
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const chooser = useRef<HTMLSelectElement>(null);
  const controls = useRef<WorldScene | null>(null);
  const names =
    kind === "solar"
      ? PLANETS.map((object) => object.name)
      : kind === "orbits"
        ? ORBIT_OBJECTS.map((object) => object.name)
        : LAYERS.map((layer) => layer.name);

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
    // A desktop panel that was opened automatically should not cover the
    // visualization when the browser is resized into a phone-sized viewport.
    const phone = window.matchMedia("(max-width: 760px)");
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) setSelected(null);
    };
    phone.addEventListener("change", handleViewportChange);
    return () => phone.removeEventListener("change", handleViewportChange);
  }, []);
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

  // Give the render camera the area between the directory and detail panel.
  // ResizeObserver also handles fonts and short viewports without magic offsets.
  useEffect(() => {
    const measure = () => {
      if (!root.current) return;
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      const railWidth = rail.current?.getBoundingClientRect().width ?? 0;
      const detailBounds = panel.current?.getBoundingClientRect();
      setInsets((previous) => {
        const next = {
          left: mobile ? 0 : railWidth + 46,
          right: mobile || !detailBounds ? 0 : detailBounds.width + 32,
          bottom: mobile && detailBounds ? detailBounds.height + 18 : 0,
        };
        return previous.left === next.left &&
          previous.right === next.right &&
          previous.bottom === next.bottom
          ? previous
          : next;
      });
    };
    const observer = new ResizeObserver(measure);
    if (rail.current) observer.observe(rail.current);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [kind, selected]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
      setFullscreenError("");
    } catch {
      setFullscreenError("Full-screen mode is unavailable in this browser.");
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
  const planetProfile = planet ? PLANET_PROFILES[planet.slug] : null;
  const lesson = layer && selected !== null ? LAYER_LESSONS[selected] : null;
  const displayAltitude = new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
  }).format(altitude);
  const profileCount = names.length;

  return (
    <div
      className={`world-page world-${kind} world-experience${selected !== null ? " has-detail" : ""}`}
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
        onSceneStatusChange={setSceneStatus}
      />

      <div className="world-side-rail" ref={rail}>
        <header className="world-heading">
          <p className="world-eyebrow">
            AEGISEARTH /{" "}
            {kind === "orbits"
              ? "ORBITAL ATLAS"
              : kind === "atmosphere"
                ? "EARTH SYSTEM"
                : "PLANETARY ATLAS"}
          </p>
          <h1>{TITLES[kind]}</h1>
          <p className="world-lead">{LEADS[kind]}</p>
          <div
            className="world-rail-status"
            aria-label="Educational visualization"
          >
            <span className="world-status-pulse" aria-hidden="true" />
            <span>Interactive 3D explorer</span>
            <small>{COUNT[kind]}</small>
          </div>
        </header>

        {kind === "orbits" && (
          <nav
            className="world-directory orbit-mission-index"
            aria-label="Explore spacecraft missions"
          >
            <div className="world-directory-heading">
              <span className="world-directory-index">
                01 / MISSION DIRECTORY
              </span>
              <h2>Choose a mission</h2>
              <p>Explore the spacecraft and the work they do above Earth.</p>
              <label className="world-chooser orbit-directory-select">
                Explore an object
                <select
                  ref={chooser}
                  value={selected ?? ""}
                  onChange={(event) =>
                    event.target.value === ""
                      ? close()
                      : select(Number(event.target.value))
                  }
                >
                  <option value="">Select a spacecraft…</option>
                  {names.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="world-directory-list orbit-index-list">
              {ORBIT_OBJECTS.map((object, index) => (
                <button
                  className="orbit-index-item"
                  type="button"
                  key={object.id}
                  onClick={() => select(index)}
                  aria-pressed={selected === index}
                  style={{ "--mission-accent": object.color } as CSSProperties}
                >
                  <span className="orbit-index-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="orbit-index-title">
                    <strong>{object.name}</strong>
                    <small>{object.category.split(" · ")[0]}</small>
                  </span>
                  <span className="orbit-index-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              ))}
            </div>
          </nav>
        )}

        {kind === "solar" && (
          <nav
            className="world-directory planet-directory"
            aria-label="Explore the planets"
          >
            <div className="world-directory-heading">
              <span className="world-directory-index">
                01 / PLANET DIRECTORY
              </span>
              <h2>Choose a world</h2>
              <p>Select a planet to reveal its mission-style profile.</p>
              <label className="world-chooser">
                Explore an object
                <select
                  ref={chooser}
                  value={selected ?? ""}
                  onChange={(event) =>
                    event.target.value === ""
                      ? close()
                      : select(Number(event.target.value))
                  }
                >
                  <option value="">Select a planet…</option>
                  {names.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="planet-directory-grid"
              role="group"
              aria-label="Planet choices"
            >
              {PLANETS.map((object, index) => (
                <button
                  key={object.slug}
                  className="planet-choice"
                  type="button"
                  onClick={() => select(index)}
                  aria-pressed={selected === index}
                  style={
                    {
                      "--planet-accent": `#${object.color.toString(16).padStart(6, "0")}`,
                    } as CSSProperties
                  }
                >
                  <span className="planet-choice-dot" aria-hidden="true" />
                  <span>{object.name}</span>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                </button>
              ))}
            </div>
          </nav>
        )}

        {kind === "atmosphere" && (
          <section
            className="world-directory altitude-lab"
            aria-label="Atmosphere altitude explorer"
          >
            <div className="world-directory-heading altitude-lab-intro">
              <span className="world-directory-index">
                01 / ALTITUDE EXPLORER
              </span>
              <h2>Explore by height</h2>
              <p>Move upward to see which atmospheric layer surrounds you.</p>
            </div>
            <div className="altitude-lab-body">
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
                <span>Surface</span>
                <span>10,000 km</span>
              </div>
              <p className="altitude-current" aria-live="polite">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: COLORS[layerAtAltitude(altitude)] }}
                />
                {LAYERS[layerAtAltitude(altitude)].name}
              </p>
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
                    ) {
                      scrub(
                        Math.min(
                          10000,
                          Math.max(0, event.target.valueAsNumber),
                        ),
                      );
                    }
                  }}
                />
              </div>
              <label className="world-chooser">
                Explore a layer
                <select
                  ref={chooser}
                  value={selected ?? ""}
                  onChange={(event) =>
                    event.target.value === ""
                      ? close()
                      : select(Number(event.target.value))
                  }
                >
                  <option value="">Choose a layer…</option>
                  {names.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="layer-steps" aria-label="Atmospheric layers">
                {LAYERS.map((item, index) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={selected === index}
                    onClick={() => select(index)}
                    style={{ "--layer-color": COLORS[index] } as CSSProperties}
                  >
                    <span aria-hidden="true" />
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {selected !== null && (
        <aside
          className="world-detail"
          ref={panel}
          aria-labelledby="object-title"
          data-testid="object-details"
          style={
            mission
              ? ({ "--profile-accent": mission.color } as CSSProperties)
              : planet
                ? ({
                    "--profile-accent": `#${planet.color.toString(16).padStart(6, "0")}`,
                  } as CSSProperties)
                : ({ "--profile-accent": COLORS[selected] } as CSSProperties)
          }
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
              ? "SPACECRAFT PROFILE"
              : planet
                ? "PLANETARY PROFILE"
                : "ATMOSPHERIC PROFILE"}
            <span className="world-profile-number">
              {String(selected + 1).padStart(2, "0")} /{" "}
              {String(profileCount).padStart(2, "0")}
            </span>
          </p>
          <div aria-live="polite" aria-atomic="true">
            <h2 id="object-title">
              {mission?.fullName ?? planet?.name ?? layer?.name}
            </h2>
            {mission && (
              <p className="orbit-detail-category">{mission.category}</p>
            )}
            {layer && <p className="layer-height">{layer.range}</p>}
            <p className="world-description">
              {mission?.summary ??
                (planet ? PLANET_STORIES[selected] : lesson?.role)}
            </p>
          </div>
          {kind !== "atmosphere" && (
            <button
              type="button"
              className="world-action"
              disabled={sceneStatus !== "ready"}
              title={
                sceneStatus === "ready" ? undefined : "Requires the 3D scene"
              }
              aria-label="Take a closer look"
              onClick={() => controls.current?.focus()}
            >
              {mission ? "Focus on spacecraft" : "Take a closer look"}
              <span aria-hidden="true">↗</span>
            </button>
          )}
          <nav
            className="world-profile-switch"
            aria-label={
              mission
                ? "Browse mission profiles"
                : planet
                  ? "Browse planet profiles"
                  : "Browse atmospheric layers"
            }
          >
            <button
              type="button"
              disabled={selected === 0}
              onClick={() => select(selected - 1)}
            >
              ← Previous
            </button>
            <span>
              {selected + 1} of {profileCount}
            </span>
            <button
              type="button"
              disabled={selected === profileCount - 1}
              onClick={() => select(selected + 1)}
            >
              Next →
            </button>
          </nav>

          {mission && (
            <>
              <p className="world-section-label">Mission at a glance</p>
              <FactList
                rows={mission.facts.slice(0, 4).map((fact) => ({
                  label: fact.label,
                  value: fact.value,
                  source: fact.source,
                }))}
              />
              <div className="orbit-explanation">
                <h3>Why this orbit matters</h3>
                <p>{mission.orbitExplanation}</p>
              </div>
              {mission.facts.length > 4 && (
                <details className="world-more-facts" open>
                  <summary>More mission facts</summary>
                  <FactList
                    rows={mission.facts.slice(4).map((fact) => ({
                      label: fact.label,
                      value: fact.value,
                      source: fact.source,
                    }))}
                  />
                </details>
              )}
              <div className="world-profile-source">
                <SourceLink
                  href={mission.summarySource.url}
                  label="Official mission overview"
                  context={mission.name}
                />
              </div>
            </>
          )}

          {planet && planetProfile && (
            <>
              <p className="planet-profile-type">
                {planetProfile.classification}
              </p>
              <p className="world-section-label">Discover this world</p>
              <div
                className="planet-highlight-grid"
                aria-label={`${planet.name} quick facts`}
              >
                <div className="planet-highlight planet-highlight-moons">
                  <span className="planet-highlight-label">Known moons</span>
                  <strong>{planet.moons}</strong>
                  <span className="planet-highlight-hint">
                    Confirmed as of 2026
                  </span>
                </div>
                <div className="planet-highlight">
                  <span className="planet-highlight-label">One rotation</span>
                  <strong className="planet-highlight-period">
                    {planetProfile.rotation}
                  </strong>
                  <span className="planet-highlight-hint">
                    {planetProfile.rotationDescription}
                  </span>
                </div>
              </div>
              <p className="world-section-label">Planet at a glance</p>
              <FactList
                rows={[
                  {
                    label: "Distance from Sun",
                    value: `${planet.distanceMillionKm} million km (average)`,
                  },
                  {
                    label: "Orbital period",
                    value: `${planet.periodDays} Earth days (${planet.periodYears} Earth years)`,
                  },
                  { label: "Diameter", value: `${planet.diameterKm} km` },
                  { label: "Ring system", value: planet.rings },
                ]}
              />
              <section className="planet-feature" aria-label="Planet highlight">
                <p className="planet-feature-eyebrow">Why it stands out</p>
                <h3>{planetProfile.featureTitle}</h3>
                <p>{planetProfile.featureDescription}</p>
              </section>
              <section
                className="planet-moons"
                aria-label="Explore natural satellites"
              >
                <p className="planet-feature-eyebrow">Explore its moons</p>
                {planetProfile.notableMoons && (
                  <strong className="planet-moons-names">
                    {planetProfile.notableMoons}
                  </strong>
                )}
                <p>{planetProfile.moonDescription}</p>
                <SourceLink
                  href={planetProfile.moonSourceUrl}
                  label="NASA moon reference"
                  context={planet.name}
                />
              </section>
              <details className="world-more-facts planet-visual-guide">
                <summary>About this visualization</summary>
                <p>
                  {planet.name === "Venus"
                    ? "The texture represents Venus's clouds, not its rocky surface."
                    : ["Jupiter", "Saturn", "Uranus", "Neptune"].includes(
                          planet.name,
                        )
                      ? "Visible bands and colours represent atmospheric layers, not a solid surface."
                      : "The texture represents the planet's visible surface; lighting and rotation are illustrative."}{" "}
                  Orbital distances and planet sizes in this scene are not to
                  scale.
                </p>
              </details>
              <div className="world-profile-source">
                <SourceLink
                  href={planetPageUrl(planet)}
                  label="NASA planet guide"
                />
                <SourceLink
                  href={planetFactSheetUrl(planet)}
                  label="NASA planetary fact sheet"
                />
              </div>
            </>
          )}

          {layer && lesson && (
            <>
              <p className="world-section-label">Inside this layer</p>
              <p className="world-layer-lesson">{lesson.lesson}</p>
              <FactList
                rows={[
                  { label: "Temperature with height", value: lesson.trend },
                  { label: "Look for", value: lesson.example },
                ]}
              />
              <div className="world-explanation">
                <h3>Explore the altitude</h3>
                <p>
                  Use the slider or enter a height to follow the bright position
                  marker. Your selected layer and this guide update together.
                </p>
              </div>
              <p className="world-note">
                The conventional Kármán line at 100 km marks a commonly used
                boundary of space, not the end of Earth's atmosphere. Layer
                boundaries are approximate and variable.
              </p>
              <div className="world-profile-source">
                <SourceLink
                  href={ATMOSPHERE_SOURCE.url}
                  label="NASA atmosphere guide"
                />
              </div>
            </>
          )}
        </aside>
      )}

      <div className="world-bottom">
        <p id="world-instructions" className="world-instruction-note">
          {kind === "atmosphere"
            ? "Drag to rotate the Earth. Use the altitude explorer to move through atmospheric layers."
            : kind === "orbits"
              ? "Drag to rotate. Choose a mission or select a spacecraft label."
              : "Drag to rotate. Choose a planet or select a label in the scene."}{" "}
          Mouse wheel to zoom. Keyboard: arrow keys, plus, minus and Home.
        </p>
        <div className="world-control-dock">
          <div
            className="world-toolbar"
            role="group"
            aria-label="Scene controls"
          >
            <button
              type="button"
              disabled={sceneStatus !== "ready"}
              onClick={() => controls.current?.reset()}
            >
              Overview
            </button>
            <button
              type="button"
              disabled={sceneStatus !== "ready"}
              onClick={() => setPaused((value) => !value)}
              aria-label={paused ? "Play animation" : "Pause animation"}
            >
              {paused ? "▶" : "Ⅱ"}
              <span>{paused ? "Play" : "Pause"}</span>
            </button>
            <span className="world-toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              disabled={sceneStatus !== "ready"}
              onClick={() => controls.current?.rotateBy(-0.2, 0)}
              aria-label="Rotate left"
            >
              ↶
            </button>
            <button
              type="button"
              disabled={sceneStatus !== "ready"}
              onClick={() => controls.current?.rotateBy(0.2, 0)}
              aria-label="Rotate right"
            >
              ↷
            </button>
            <button
              type="button"
              disabled={sceneStatus !== "ready"}
              onClick={() => controls.current?.zoomBy(-1)}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              disabled={sceneStatus !== "ready"}
              onClick={() => controls.current?.zoomBy(1)}
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="world-toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              onClick={toggleFullscreen}
              disabled={!document.fullscreenEnabled || sceneStatus !== "ready"}
              aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}
            >
              ⛶<span>{fullscreen ? "Exit" : "Full screen"}</span>
            </button>
          </div>
          <details className="world-visual-credits">
            <summary>Visualization guide & credits</summary>
            <div className="world-visual-credits-content">
              <strong>How to explore</strong>
              <p>
                Drag to rotate, scroll to zoom, or use the scene controls. You
                can also select objects from the directory.
              </p>
              <strong>How to read this model</strong>
              <p>
                {kind === "orbits"
                  ? "Reference orbits only: distances are compressed, models enlarged, and animation accelerated. This is not live spacecraft tracking."
                  : kind === "atmosphere"
                    ? "Atmospheric thickness is exaggerated to show the layers. Colours identify layers, not measured temperatures or gas densities."
                    : "Planet sizes are enlarged and distances compressed. Positions and orbital motion are illustrative, not current ephemerides."}
              </p>
              <p>
                Textures:{" "}
                <a
                  href="https://www.solarsystemscope.com/textures/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Solar System Scope
                </a>{" "}
                (
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  CC BY 4.0
                </a>
                ).
              </p>
              {kind === "solar" && (
                <p>
                  Planet X remains hypothetical; there is no confirmed planet or
                  position to display.{" "}
                  <SourceLink
                    href={PLANET_X_SOURCE.url}
                    label="NASA explanation"
                  />
                </p>
              )}
            </div>
          </details>
          {fullscreenError && (
            <p className="world-fullscreen-error" role="status">
              {fullscreenError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
