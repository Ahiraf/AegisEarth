import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ImageViewer } from "../../components/ImageViewer";
import { Reveal } from "../../components/Reveal";
import { SectionHeader } from "../../components/SectionHeader";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { FIT_VIEW, type ViewState } from "../../lib/viewState";
import { apiUrl, errorMessage, get } from "./api";
import {
  LayerImages,
  SurveyControls,
  useSurveyLayers,
  type LayerChoices,
  type Layers,
} from "./SurveyLayers";
import type { Frame, Manifest, TimelineMode } from "./types";

export interface SkyPosition {
  ra_deg: number;
  dec_deg: number;
  frameId?: string;
}
interface Props {
  id: string;
  manifest: Manifest;
  frames: Frame[];
  loading: boolean;
  mode: TimelineMode;
  onMode: (mode: TimelineMode) => void;
  onPosition: (position: SkyPosition) => void;
  position: SkyPosition | null;
  onFrame: (frame: Frame | undefined) => void;
}
function FrameFigure({
  frame,
  label,
  view,
  onView,
  onDecoded,
  layers,
  opacity,
  onPixel,
}: {
  frame: Frame;
  label: string;
  view: ViewState;
  onView: (view: ViewState) => void;
  onDecoded?: (id: string) => void;
  layers?: Layers;
  opacity?: number;
  onPixel?: (x: number, y: number) => void;
}) {
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [h, w] = frame.spatial.shape;
  const ratio = w / h;
  function pixel(event: MouseEvent<HTMLDivElement>) {
    if (!onPixel || view.zoom !== 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onPixel(
      Math.max(
        0,
        Math.min(w - 1, ((event.clientX - rect.left) / rect.width) * w - 0.5),
      ),
      Math.max(
        0,
        Math.min(h - 1, ((event.clientY - rect.top) / rect.height) * h - 0.5),
      ),
    );
  }
  const source = apiUrl(
    frame.preview.url || `/api/v1/artifacts/${frame.preview.id}/content`,
  );
  return (
    <article className="panel sky-image-card">
      <p className="eyebrow">{label}</p>
      <ImageViewer
        label={label}
        caption={`${frame.spectral.detectors.join(", ")} · ${frame.spectral.unit}`}
        view={view}
        onViewChange={onView}
      >
        <div className="sky-canvas">
          <div
            className={`sky-image-plane${onPixel ? " is-pickable" : ""}`}
            style={{
              width: ratio > 1.6 ? "100%" : `${(ratio / 1.6) * 100}%`,
              height: ratio > 1.6 ? `${(1.6 / ratio) * 100}%` : "100%",
            }}
            onClick={pixel}
          >
            <img
              key={version}
              src={source + (version ? `?retry=${version}` : "")}
              alt={`SPHEREx ${frame.time.label_utc}, ${frame.spectral.detectors.join(", ")}`}
              draggable={false}
              onLoad={() => {
                setError(false);
                onDecoded?.(frame.id);
              }}
              onError={() => setError(true)}
            />
            {layers ? (
              <LayerImages
                frame={frame}
                layers={layers}
                opacity={opacity ?? 0.5}
              />
            ) : null}
          </div>
        </div>
      </ImageViewer>
      {error ? (
        <div className="field-error" role="alert">
          This preview could not be loaded.{" "}
          <button
            className="btn btn-s btn-sm"
            onClick={() => {
              setError(false);
              setVersion((v) => v + 1);
            }}
          >
            Retry preview
          </button>
        </div>
      ) : null}
      <p className="sky-date mono">{frame.time.label_utc}</p>
      <p className="note">
        {frame.stretch.mode === "shared_asinh"
          ? "Shared intensity stretch"
          : "Per-image stretch · visual brightness is normalized"}{" "}
        ·{" "}
        {frame.kind === "temporal_bin"
          ? "Averaged interval"
          : "Observation midpoint"}
      </p>
    </article>
  );
}
export function MoviePlayer({
  id,
  manifest,
  frames,
  loading,
  mode,
  onMode,
  onPosition,
  position,
  onFrame,
}: Props) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [display, setDisplay] = useState<"sequence" | "blink" | "side">(
    "sequence",
  );
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const [view, setView] = useState<ViewState>(FIT_VIEW);
  const [decoded, setDecoded] = useState("");
  const [layersChoice, setLayersChoice] = useState<LayerChoices>({
    gaia: false,
    wise: false,
    band: "",
    opacity: 0.5,
  });
  const [layerRetry, setLayerRetry] = useState(0);
  const [pickError, setPickError] = useState("");
  const pickController = useRef<AbortController | null>(null);
  const ordinal = Math.min(index, Math.max(0, frames.length - 1));
  const frame = frames[ordinal];
  useEffect(() => () => pickController.current?.abort(), [frame?.id]);
  useEffect(() => {
    onFrame(frame);
  }, [frame, onFrame]);
  const timeline = manifest.timelines[mode];
  const canAnimate =
    timeline.distinct_epoch_count >= 2 && frames.length >= 2 && !loading;
  const layers = useSurveyLayers(
    id,
    mode,
    frame,
    layersChoice,
    playing,
    layerRetry,
  );
  useEffect(() => {
    setPlaying(false);
  }, [reduced]);
  useEffect(() => {
    if (
      !playing ||
      !canAnimate ||
      display === "side" ||
      !frame ||
      decoded !== frame.id
    )
      return;
    const timer = setTimeout(
      () =>
        setIndex((i) => {
          if (display === "blink")
            return i === a ? Math.min(b, frames.length - 1) : a;
          if (i + 1 < frames.length) return i + 1;
          if (loop) return 0;
          setPlaying(false);
          return i;
        }),
      700 / speed,
    );
    return () => clearTimeout(timer);
  }, [
    playing,
    canAnimate,
    display,
    frame,
    decoded,
    a,
    b,
    frames.length,
    loop,
    speed,
  ]);
  useEffect(() => {
    const candidates = frames.slice(ordinal + 1, ordinal + 3).map((f) => {
      const image = new Image();
      image.src = apiUrl(
        f.preview.url || `/api/v1/artifacts/${f.preview.id}/content`,
      );
      return image;
    });
    return () => {
      candidates.forEach((image) => {
        image.src = "";
      });
    };
  }, [frames, ordinal]);
  function step(delta: number) {
    if (display === "side") return;
    setPlaying(false);
    setIndex((i) => Math.max(0, Math.min(frames.length - 1, i + delta)));
  }
  function togglePlayback() {
    if (!playing) {
      if (display === "blink" && index !== a && index !== b) setIndex(a);
      if (display === "sequence" && ordinal === frames.length - 1) setIndex(0);
    }
    setPlaying((p) => !p);
  }
  async function pick(x: number, y: number) {
    if (!frame) return;
    pickController.current?.abort();
    const controller = new AbortController();
    pickController.current = controller;
    setPickError("");
    try {
      const value = await get<SkyPosition>(
        `/api/v1/views/${id}/frames/${frame.ordinal}/coordinates?mode=${mode}&origin=png&x=${x}&y=${y}`,
        controller.signal,
      );
      if (!controller.signal.aborted)
        onPosition({ ...value, frameId: frame.id });
    } catch (error) {
      if (!controller.signal.aborted) setPickError(errorMessage(error));
    }
  }
  return (
    <Reveal id="movie">
      <SectionHeader
        eyebrow="03 / PLAY A SKY MOVIE"
        title="Explore images across time"
        chip={
          <span className={`chip ${canAnimate ? "chip-info" : "chip-plain"}`}>
            {loading
              ? "LOADING TIMELINE"
              : timeline.outcome.replaceAll("_", " ").toUpperCase()}
          </span>
        }
      />
      <div className="tb">
        <label className="field">
          Timeline
          <select
            className="input"
            value={mode}
            onChange={(e) => {
              setPlaying(false);
              onMode(e.target.value as TimelineMode);
            }}
          >
            <option value="common">Sky-fixed comparison grid</option>
            <option value="native">Native image inspection</option>
          </select>
        </label>
        <label className="field">
          Display
          <select
            aria-label="Display"
            className="input"
            value={display}
            onChange={(e) => {
              setPlaying(false);
              setDisplay(e.target.value as typeof display);
              if (e.target.value === "blink" || e.target.value === "side")
                setIndex(a);
            }}
          >
            <option value="sequence">Chronological sequence</option>
            <option value="blink" disabled={!canAnimate}>
              Blink A / B
            </option>
            <option value="side" disabled={frames.length < 2}>
              Side by side
            </option>
          </select>
        </label>
        <span className="note">
          {timeline.comparison_supported
            ? "Registration support recorded"
            : "Browsing available · scientific comparison unvalidated"}
        </span>
      </div>
      {!loading && timeline.frame_count === 1 && frames.length === 1 && (
        <p className="note">
          One image is available in this timeline. Try a wider observation
          window to compare dates.
        </p>
      )}
      {frames.length > 1 && (
        <p className="note">
          Choose Blink A / B to switch between observations, or Side by side to
          inspect both images together.
        </p>
      )}
      {!frames.length ? (
        <div className="state">
          <p className="state-title">
            {loading
              ? "Preparing chronological frames…"
              : "No images in this timeline"}
          </p>
          <p>
            Try another detector, a wider field or different dates.
            {mode === "common" && manifest.timelines.native.frame_count
              ? " Native inspection has images available."
              : ""}
          </p>
          {mode === "common" && manifest.timelines.native.frame_count ? (
            <button className="btn btn-s" onClick={() => onMode("native")}>
              Inspect native images
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div
            tabIndex={0}
            role="region"
            aria-label="Sky movie player"
            className="sky-player"
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "ArrowRight") {
                e.preventDefault();
                step(1);
              }
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                step(-1);
              }
              if (e.key === " " && canAnimate && display !== "side") {
                e.preventDefault();
                togglePlayback();
              }
            }}
          >
            {display === "side" ? (
              <div className="cg">
                {[a, Math.min(b, frames.length - 1)].map((i, slot) => (
                  <FrameFigure
                    key={`${frames[i]?.id}:${slot}`}
                    frame={frames[i]}
                    label={slot ? "Observation B" : "Observation A"}
                    view={view}
                    onView={setView}
                  />
                ))}
              </div>
            ) : (
              <div className="movie-workbench">
                <div
                  className="movie-transport"
                  role="group"
                  aria-label="Frame playback"
                >
                  <button
                    className="btn btn-s btn-sm"
                    disabled={ordinal === 0}
                    onClick={() => step(-1)}
                    aria-label="Previous frame"
                  >
                    ← Previous
                  </button>
                  <button
                    className="btn btn-p btn-sm"
                    disabled={!canAnimate}
                    onClick={togglePlayback}
                  >
                    {playing ? "Pause" : "Play"}
                  </button>
                  <button
                    className="btn btn-s btn-sm"
                    disabled={ordinal >= frames.length - 1}
                    onClick={() => step(1)}
                    aria-label="Next frame"
                  >
                    Next →
                  </button>
                </div>
                <FrameFigure
                  key={frame.id}
                  frame={frame}
                  label={`Frame ${ordinal + 1} of ${frames.length}`}
                  view={view}
                  onView={setView}
                  onDecoded={setDecoded}
                  layers={layers}
                  opacity={layersChoice.opacity}
                  onPixel={(x, y) => void pick(x, y)}
                />
                <aside className="movie-reading">
                  <h3>What am I seeing?</h3>
                  <p>
                    Each square is one of the {frame.spatial.shape[1]} ×{" "}
                    {frame.spatial.shape[0]} pixels in this infrared view. A
                    small source can spread its light across several squares.
                    Zoom in to inspect those pixels.
                  </p>
                  <ul className="movie-pixel-key">
                    <li>
                      <i className="signal-high" />
                      White or light gray — stronger signal
                    </li>
                    <li>
                      <i className="signal-low" />
                      Dark gray or black — weaker signal
                    </li>
                    <li>
                      <i className="signal-missing" />
                      Striped area — no usable value
                    </li>
                  </ul>
                  {frames.length > 1 && (
                    <p>
                      {mode === "common"
                        ? "Pick a bright patch and step through the dates. Does it stay in the same place relative to nearby patches?"
                        : "Use nearby bright patches to recognize the same area across dates. The camera angle and coverage can change."}
                    </p>
                  )}
                  <p className="note">
                    {frame.stretch.mode === "shared_asinh"
                      ? "These frames use the same brightness scale. Compare visits at similar wavelengths when looking for a change."
                      : "Each frame uses its own brightness scale. A patch can appear brighter simply because the display scale changed."}
                  </p>
                </aside>
              </div>
            )}
            <div className="sky-playback card">
              <div className="tb">
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={loop}
                    disabled={!canAnimate}
                    onChange={(e) => setLoop(e.target.checked)}
                  />
                  Loop
                </label>
                <label className="field">
                  Display speed
                  <select
                    aria-label="Display speed"
                    className="input"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    {[0.25, 0.5, 1, 2, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}×
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="sky-scrubber">
                Frame {ordinal + 1} / {frames.length}
                <input
                  aria-label="Timeline frame"
                  type="range"
                  min="0"
                  max={Math.max(0, frames.length - 1)}
                  value={ordinal}
                  disabled={frames.length < 2 || display === "side"}
                  onChange={(e) => {
                    setPlaying(false);
                    setIndex(Number(e.target.value));
                  }}
                />
              </label>
              {display !== "side" && frames.length > 1 ? (
                <div
                  className="explorer-filmstrip"
                  aria-label="Available movie frames"
                >
                  <p className="explorer-mini-kicker">
                    JUMP TO AN OBSERVED FRAME
                  </p>
                  <div className="explorer-filmstrip-track">
                    {frames.map((item, i) => (
                      <button
                        key={item.id}
                        type="button"
                        className="explorer-filmstrip-frame"
                        aria-pressed={ordinal === i}
                        onClick={() => {
                          setPlaying(false);
                          setIndex(i);
                        }}
                      >
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <small>{item.time.label_utc}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="note">
                UTC observing times are shown above. Playback speed is for
                display; actual time since the previous frame:{" "}
                {frame.time.gap_seconds !== undefined
                  ? `${frame.time.gap_seconds.toLocaleString()} seconds`
                  : "first frame"}
                .{" "}
                {reduced
                  ? "Reduced motion is enabled; playback starts paused."
                  : "Playback starts paused."}{" "}
                Arrow keys step when the player is focused.
              </p>
              {display === "blink" || display === "side" ? (
                <div className="tb">
                  {(["A", "B"] as const).map((label, slot) => (
                    <label className="field" key={label}>
                      Observation {label}
                      <select
                        className="input"
                        value={slot ? Math.min(b, frames.length - 1) : a}
                        onChange={(e) => {
                          setPlaying(false);
                          (slot ? setB : setA)(Number(e.target.value));
                          setIndex(slot ? a : Number(e.target.value));
                        }}
                      >
                        {frames.map((f, i) => (
                          <option
                            key={f.id}
                            value={i}
                            disabled={slot ? i === a : i === b}
                          >
                            {i + 1} · {f.time.label_utc}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <span className="note">
                    {frames[a] && frames[b] && (
                      <>
                        {frames[a].time.label_utc} and{" "}
                        {frames[b].time.label_utc}
                        {" · "}
                        {Number(
                          (
                            Math.abs(
                              Number(frames[a].time.mid_mjd_utc) -
                                Number(frames[b].time.mid_mjd_utc),
                            ) * 24
                          ).toPrecision(3),
                        )}{" "}
                        hours apart.{" "}
                      </>
                    )}
                    Both panels share zoom and pan. Native images can have
                    different orientation and field coverage. In side-by-side
                    mode the inspector follows observation A.
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <SurveyControls
            value={layersChoice}
            onChange={(next) => {
              setPlaying(false);
              setLayersChoice(next);
            }}
            layers={layers}
            onRetry={() => {
              setPlaying(false);
              setLayerRetry((n) => n + 1);
            }}
          />
          <div className="sky-inspector card">
            <h3>Coordinates, quality and source evidence</h3>
            <p className="help">
              Click a sky pixel at fit-to-frame zoom to choose a spectrum
              position, or enter a position in the extraction panel.
            </p>
            {position ? (
              <p className="mono sky-position" role="status">
                RA {position.ra_deg.toFixed(8)}° · Dec{" "}
                {position.dec_deg.toFixed(8)}°
              </p>
            ) : null}
            {pickError ? (
              <p className="field-error" role="alert">
                {pickError}
              </p>
            ) : null}
            <dl className="sky-facts">
              <div>
                <dt>Observed interval (UTC)</dt>
                <dd>
                  {frame.time.start_utc}
                  <br />
                  {frame.time.end_utc}
                </dd>
              </div>
              <div>
                <dt>Detector / intensity unit</dt>
                <dd>
                  {frame.spectral.detectors.join(", ")} · {frame.spectral.unit}
                </dd>
              </div>
              <div>
                <dt>Spatial grid</dt>
                <dd>
                  {frame.spatial.shape[1]} × {frame.spatial.shape[0]} pixels ·{" "}
                  {mode === "common" ? "sky-fixed" : "native"}
                </dd>
              </div>
              <div>
                <dt>Display scaling</dt>
                <dd>
                  {frame.stretch.mode.replaceAll("_", " ")}
                  {frame.stretch.limits_mjy_sr
                    ? ` · ${frame.stretch.limits_mjy_sr.map((v) => v.toPrecision(4)).join(" to ")} MJy/sr`
                    : ""}
                </dd>
              </div>
            </dl>
            <p className="note">
              NASA/IPAC IRSA / SPHEREx. These images support inspection;
              validated motion and calibrated brightness measurements require
              separate scientific acceptance.
            </p>
            <div className="tb sky-downloads">
              <a
                className="btn btn-s btn-sm"
                href={apiUrl(
                  frame.preview.url ||
                    `/api/v1/artifacts/${frame.preview.id}/content`,
                )}
              >
                Download PNG
              </a>
              {frame.science ? (
                <a
                  className="btn btn-s btn-sm"
                  href={apiUrl(
                    frame.science.url ||
                      `/api/v1/artifacts/${frame.science.id}/content`,
                  )}
                >
                  Download FITS planes
                </a>
              ) : null}
              {frame.science_image_url ? (
                <a className="srclink" href={apiUrl(frame.science_image_url)}>
                  Primary sky FITS
                </a>
              ) : null}
            </div>
            <details className="sky-details">
              <summary>Calibration, contamination flags and provenance</summary>
              <ul className="note">
                {[...manifest.warnings, ...frame.warnings]
                  .filter((v, i, all) => all.indexOf(v) === i)
                  .map((w) => (
                    <li key={w}>{w}</li>
                  ))}
              </ul>
              <div className="tw">
                <table>
                  <caption className="sr-only">
                    Contributing source products
                  </caption>
                  <thead>
                    <tr>
                      <th>Source product</th>
                      <th>Release</th>
                      <th>Detector</th>
                      <th>Data credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frame.original_inputs.map((f) => (
                      <tr key={f.product_id}>
                        <td className="sky-break">
                          {f.source_url ? (
                            <a
                              className="srclink"
                              href={f.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {f.product_id.slice(0, 18)}… ↗
                            </a>
                          ) : (
                            f.product_id
                          )}
                        </td>
                        <td>{f.collection}</td>
                        <td>{f.detector}</td>
                        <td>
                          {f.doi ? (
                            <a
                              href={`https://doi.org/${f.doi}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {f.doi}
                            </a>
                          ) : (
                            "NASA/IPAC IRSA"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <pre className="sky-json">
                {JSON.stringify(frame.quality, null, 2)}
              </pre>
            </details>
          </div>
        </>
      )}
    </Reveal>
  );
}
