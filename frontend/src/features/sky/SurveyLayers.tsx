import { useEffect, useRef, useState } from "react";
import { apiUrl, errorMessage, get } from "./api";
import type {
  CatalogLayer,
  Frame,
  OverlayMarker,
  TimelineMode,
  WiseLayer,
} from "./types";

export interface LayerChoices {
  gaia: boolean;
  wise: boolean;
  band: string;
  opacity: number;
}
export interface Layers {
  frameId: string;
  loading: boolean;
  markers: OverlayMarker[];
  wise?: WiseLayer;
  notes: string[];
  errors: string[];
}
export function useSurveyLayers(
  viewId: string,
  mode: TimelineMode,
  frame: Frame | undefined,
  choices: LayerChoices,
  playing: boolean,
  retry: number,
): Layers {
  const cache = useRef(new Map<string, CatalogLayer | WiseLayer>());
  const [state, setState] = useState<Layers>({
    frameId: "",
    loading: false,
    markers: [],
    notes: [],
    errors: [],
  });
  const frameId = frame?.id;
  const ordinal = frame?.ordinal;
  useEffect(() => {
    if (!frameId || ordinal === undefined) return;
    const controller = new AbortController();
    const signal = controller.signal;
    if (playing) {
      setState({
        frameId,
        loading: false,
        markers: [],
        notes: [
          "Pause playback to load optional survey context for this frame.",
        ],
        errors: [],
      });
      return () => controller.abort();
    }
    setState({
      frameId,
      loading: choices.gaia || choices.wise || Boolean(choices.band),
      markers: [],
      notes: [],
      errors: [],
    });
    async function load<T extends CatalogLayer | WiseLayer>(
      key: string,
      path: string,
    ): Promise<T> {
      const existing = cache.current.get(key);
      if (existing && !retry) return existing as T;
      const value = await get<T>(path, signal);
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      cache.current.set(key, value);
      if (cache.current.size > 32)
        cache.current.delete(cache.current.keys().next().value!);
      return value;
    }
    (async () => {
      const surveys = [
        choices.gaia ? "gaia" : "",
        choices.wise ? "wise" : "",
      ].filter(Boolean);
      const catalog = await Promise.allSettled(
        surveys.map((s) =>
          load<CatalogLayer>(
            `${viewId}:${mode}:${frameId}:${s}`,
            `/api/v1/views/${viewId}/overlays/catalogs?survey=${s}&mode=${mode}&ordinal=${ordinal}`,
          ),
        ),
      );
      if (signal.aborted) return;
      const markers: OverlayMarker[] = [];
      const notes: string[] = [];
      const errors: string[] = [];
      catalog.forEach((r, i) => {
        if (r.status === "fulfilled") {
          markers.push(...r.value.markers.filter((m) => m.pixel.inside));
          notes.push(
            `${surveys[i] === "gaia" ? "Gaia DR3" : "AllWISE"}: ${r.value.markers.filter((m) => m.pixel.inside).length} markers in this frame${r.value.truncated ? " · capped sample" : ""}. ${r.value.credits}`,
          );
        } else errors.push(`${surveys[i]}: ${errorMessage(r.reason)}`);
      });
      setState({
        frameId,
        loading: Boolean(choices.band),
        markers,
        notes,
        errors,
      });
      let wise: WiseLayer | undefined;
      if (choices.band) {
        try {
          wise = await load<WiseLayer>(
            `${viewId}:${mode}:${mode === "common" ? "fixed_grid" : frameId}:W${choices.band}`,
            `/api/v1/views/${viewId}/overlays/wise/${choices.band}?mode=${mode}&ordinal=${ordinal}`,
          );
          notes.push(
            `AllWISE ${wise.band}: ${wise.source.date_obs1} to ${wise.source.date_obs2}. Independent display stretch and PSF.`,
          );
        } catch (error) {
          errors.push(`WISE image: ${errorMessage(error)}`);
        }
      }
      if (!signal.aborted)
        setState({ frameId, loading: false, markers, wise, notes, errors });
    })();
    return () => controller.abort();
  }, [
    viewId,
    mode,
    frameId,
    ordinal,
    choices.gaia,
    choices.wise,
    choices.band,
    playing,
    retry,
  ]);
  return state.frameId === frameId
    ? state
    : {
        frameId: frameId || "",
        loading: true,
        markers: [],
        notes: [],
        errors: [],
      };
}
export function SurveyControls({
  value,
  onChange,
  layers,
  onRetry,
}: {
  value: LayerChoices;
  onChange: (value: LayerChoices) => void;
  layers: Layers;
  onRetry: () => void;
}) {
  return (
    <details
      className="sky-details"
      open={value.gaia || value.wise || Boolean(value.band)}
    >
      <summary>Survey context · Gaia and WISE</summary>
      <div className="tb sky-layer-controls">
        <label className="check-line">
          <input
            type="checkbox"
            checked={value.gaia}
            onChange={(e) => onChange({ ...value, gaia: e.target.checked })}
          />
          Gaia DR3 markers{" "}
          <span className="sky-legend gaia" aria-hidden="true">
            ○
          </span>
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={value.wise}
            onChange={(e) => onChange({ ...value, wise: e.target.checked })}
          />
          AllWISE markers{" "}
          <span className="sky-legend wise" aria-hidden="true">
            ◇
          </span>
        </label>
        <label className="field">
          WISE image
          <select
            className="input"
            aria-label="WISE image"
            value={value.band}
            onChange={(e) => onChange({ ...value, band: e.target.value })}
          >
            <option value="">Off</option>
            <option value="1">W1 · context image</option>
            <option value="2">W2 · context image</option>
          </select>
        </label>
        <label className="field">
          Context opacity
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={value.opacity}
            onChange={(e) =>
              onChange({ ...value, opacity: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <p className="note">
        Gaia circles and AllWISE diamonds show catalog positions or predictions,
        not SPHEREx detections. WISE images have different observing dates,
        bands and resolution.
      </p>
      <div aria-live="polite" className="note">
        {layers.loading ? <p>Loading optional context…</p> : null}
        {layers.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
        {layers.errors.map((e) => (
          <p key={e} className="field-error">
            {e}
          </p>
        ))}
      </div>
      {layers.errors.length ? (
        <button className="btn btn-s btn-sm" onClick={onRetry}>
          Retry survey context
        </button>
      ) : null}
    </details>
  );
}
export function LayerImages({
  frame,
  layers,
  opacity,
}: {
  frame: Frame;
  layers: Layers;
  opacity: number;
}) {
  const [h, w] = frame.spatial.shape;
  return (
    <>
      {layers.wise ? (
        <img
          className="sky-context-image"
          src={apiUrl(layers.wise.png_url)}
          alt={`${layers.wise.band} AllWISE coadd context`}
          style={{ opacity }}
          draggable={false}
        />
      ) : null}
      <svg
        className="sky-marker-map"
        viewBox={`0 0 ${w} ${h}`}
        aria-label="Catalog context markers"
        role="img"
      >
        {layers.markers
          .filter((m) => m.pixel.x_png !== null && m.pixel.y_png !== null)
          .map((m) => {
            const x = m.pixel.x_png!,
              y = m.pixel.y_png!,
              r = Math.max(0.5, w / 100);
            const gaia = m.survey.startsWith("Gaia");
            return (
              <g key={`${m.survey}:${m.id}`} className={gaia ? "gaia" : "wise"}>
                <title>
                  {m.survey} {m.id} · {m.position_status.replaceAll("_", " ")}
                </title>
                {gaia ? (
                  <circle cx={x} cy={y} r={r} />
                ) : (
                  <path
                    d={`M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`}
                  />
                )}
              </g>
            );
          })}
      </svg>
    </>
  );
}
