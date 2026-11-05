import { useState, type FormEvent } from "react";
import { Reveal } from "../../components/Reveal";
import { SectionHeader } from "../../components/SectionHeader";
import type { References, Target, ViewRequest } from "./types";

export const DEFAULT_REQUEST: ViewRequest = {
  contract_version: "view-v2",
  region: { ra: 210.80227, dec: 54.34895, width_arcmin: 5, height_arcmin: 5 },
  collections: [
    "spherex_qr3",
    "spherex_qr3_deep",
    "spherex_qr2",
    "spherex_qr2_deep",
  ],
  detectors: [],
  max_frames: 3,
  preparation: {
    spectral_mode: "common_available",
    temporal_bin_seconds: 0,
    stretch: "shared_asinh",
    native_preview_policy: "masked",
    target_exclusion_radius_arcsec: 30,
  },
};
const RELEASE_NAMES: Record<string, string> = {
  spherex_qr3: "QR3 · wide",
  spherex_qr3_deep: "QR3 · deep",
  spherex_qr2: "QR2 · wide",
  spherex_qr2_deep: "QR2 · deep",
};

interface Props {
  value: ViewRequest;
  onChange: (value: ViewRequest) => void;
  references?: References;
  busy: boolean;
  onPrepare: (value: ViewRequest) => void;
  onDiscover: (value: ViewRequest) => void;
  onShare: (value: ViewRequest) => void;
}
export function SearchForm({
  value,
  onChange,
  references,
  busy,
  onPrepare,
  onDiscover,
  onShare,
}: Props) {
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<Target | null>(null);
  const limits = references?.capabilities.view_limits as
    | { total_bytes?: number; wall_seconds?: number }
    | undefined;
  const gridWidth = Math.ceil((value.region.width_arcmin * 60) / 6.15);
  const gridHeight = Math.ceil((value.region.height_arcmin * 60) / 6.15);
  const setRegion = (
    field: keyof ViewRequest["region"],
    next: string | number,
  ) => onChange({ ...value, region: { ...value.region, [field]: next } });
  const setPrep = (next: Partial<ViewRequest["preparation"]>) =>
    onChange({
      ...value,
      detectors: [],
      preparation: { ...value.preparation, ...next },
    });
  function validate(): boolean {
    if (!String(value.region.ra).trim() || !String(value.region.dec).trim()) {
      setError("Enter right ascension and declination.");
      return false;
    }
    if (Boolean(value.start_at) !== Boolean(value.end_at)) {
      setError("Set both observation dates, or leave both empty.");
      return false;
    }
    if (
      value.start_at &&
      value.end_at &&
      (Date.parse(value.end_at) <= Date.parse(value.start_at) ||
        Date.parse(value.end_at) - Date.parse(value.start_at) > 730 * 86400000)
    ) {
      setError("Choose an ordered observation window of at most 730 days.");
      return false;
    }
    if (!value.collections.length) {
      setError("Select at least one data release.");
      return false;
    }
    if (
      (value.wavelength_min_um == null) !== (value.wavelength_max_um == null) ||
      (value.wavelength_min_um != null &&
        value.wavelength_max_um! < value.wavelength_min_um)
    ) {
      setError(
        "Set both wavelength limits in ascending order, or leave both empty.",
      );
      return false;
    }
    setError("");
    return true;
  }
  function prepare(event: FormEvent) {
    event.preventDefault();
    if (validate()) onPrepare(value);
  }
  function target(target: Target) {
    setPreset(target);
    const mover =
      Math.abs(target.pm_ra_cosdec_mas_yr || 0) > 1000 ||
      Math.abs(target.pm_dec_mas_yr || 0) > 1000;
    onChange({
      ...value,
      region: {
        ra: target.ra_deg,
        dec: target.dec_deg,
        width_arcmin: mover ? 10 : 5,
        height_arcmin: mover ? 10 : 5,
      },
    });
  }
  const spectral = value.preparation.spectral_mode;
  return (
    <Reveal id="find">
      <SectionHeader
        eyebrow="01 / Select a region"
        title="Find observations"
        chip={<span className="chip chip-info">LIVE SPHEREx DATA</span>}
        lead="Choose a patch of sky, then prepare its chronological images. Observation dates are in UTC."
      />
      <div className="card">
        <form
          className="sky-form"
          onSubmit={prepare}
          aria-label="Prepare sky view"
        >
          <div className="sky-form-grid">
            <label className="field" htmlFor="search-ra">
              Right ascension{" "}
              <input
                className="input"
                id="search-ra"
                required
                value={value.region.ra}
                onChange={(e) => setRegion("ra", e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="field-hint">
                Decimal degrees or 08:55:10.831
              </span>
            </label>
            <label className="field" htmlFor="search-dec">
              Declination{" "}
              <input
                className="input"
                id="search-dec"
                required
                value={value.region.dec}
                onChange={(e) => setRegion("dec", e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="field-hint">Degrees, −90 to +90</span>
            </label>
            <label className="field">
              Field width (arcmin)
              <input
                aria-label="Field width (arcmin)"
                className="input"
                type="number"
                min="1"
                max="30"
                step="0.1"
                required
                value={value.region.width_arcmin}
                onChange={(e) =>
                  setRegion("width_arcmin", e.target.valueAsNumber)
                }
              />
              <span className="field-hint">
                Larger patches transfer more data
              </span>
            </label>
            <label className="field">
              Field height (arcmin)
              <input
                className="input"
                type="number"
                min="1"
                max="30"
                step="0.1"
                required
                value={value.region.height_arcmin}
                onChange={(e) =>
                  setRegion("height_arcmin", e.target.valueAsNumber)
                }
              />
            </label>
            <label className="field">
              Observation start
              <input
                className="input"
                type="date"
                value={value.start_at?.slice(0, 10) || ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    start_at: e.target.value
                      ? e.target.value + "T00:00:00Z"
                      : null,
                  })
                }
              />
              <span className="field-hint">
                Optional · leave both dates empty for available epochs
              </span>
            </label>
            <label className="field">
              Observation end
              <input
                className="input"
                type="date"
                value={value.end_at?.slice(0, 10) || ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    end_at: e.target.value
                      ? e.target.value + "T23:59:59Z"
                      : null,
                  })
                }
              />
            </label>
            <label className="field">
              Spectral selection
              <select
                aria-label="Spectral selection"
                className="input"
                value={spectral}
                onChange={(e) =>
                  setPrep({
                    spectral_mode: e.target.value as typeof spectral,
                    detector: e.target.value === "detector" ? "D6" : null,
                    channel_id: e.target.value === "channel" ? 1 : null,
                  })
                }
              >
                <option value="common_available">
                  Common available wavelengths
                </option>
                <option value="detector">Choose detector</option>
                <option value="channel">Choose nominal channel</option>
              </select>
            </label>
            <label className="field">
              Maximum source images
              <select
                className="input"
                value={value.max_frames}
                onChange={(e) =>
                  onChange({ ...value, max_frames: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 6, 9, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} image{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                A bounded sample of returned observations
              </span>
            </label>
            {spectral === "detector" ? (
              <label className="field">
                Detector
                <select
                  className="input"
                  value={value.preparation.detector || "D6"}
                  onChange={(e) => setPrep({ detector: e.target.value })}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n}>D{n}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {spectral === "channel" ? (
              <label className="field">
                Nominal channel
                <select
                  aria-label="Nominal channel"
                  className="input"
                  value={value.preparation.channel_id || 1}
                  onChange={(e) =>
                    setPrep({ channel_id: Number(e.target.value) })
                  }
                >
                  {Array.from({ length: 102 }, (_, i) => {
                    const channel = references?.channels.find(
                      (c) => c.id === i + 1,
                    );
                    return (
                      <option key={i + 1} value={i + 1}>
                        {i + 1} ·{" "}
                        {channel?.detector || `D${Math.ceil((i + 1) / 17)}`}
                        {typeof channel?.band_center_um === "number"
                          ? ` · ${channel.band_center_um.toFixed(3)} μm`
                          : ""}
                      </option>
                    );
                  })}
                </select>
                <span className="field-hint">
                  Nominal band choice does not guarantee local coverage
                </span>
              </label>
            ) : null}
          </div>
          <details className="sky-details">
            <summary>Release, display and averaging options</summary>
            <div className="sky-options-grid">
              <fieldset className="sky-fieldset">
                <legend>Data releases</legend>
                {Object.entries(RELEASE_NAMES).map(([key, label]) => (
                  <label className="check-line" key={key}>
                    <input
                      type="checkbox"
                      checked={value.collections.includes(key)}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          collections: e.target.checked
                            ? [...value.collections, key]
                            : value.collections.filter((c) => c !== key),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label className="field">
                Display stretch
                <select
                  className="input"
                  value={value.preparation.stretch || "shared_asinh"}
                  onChange={(e) =>
                    setPrep({
                      stretch: e.target.value as
                        | "shared_asinh"
                        | "per_frame_asinh",
                    })
                  }
                >
                  <option value="shared_asinh">Shared across time</option>
                  <option value="per_frame_asinh">
                    Per image · brightness not comparable
                  </option>
                </select>
              </label>
              <label className="field">
                Average within (seconds)
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="300"
                  value={value.preparation.temporal_bin_seconds || 0}
                  onChange={(e) =>
                    setPrep({ temporal_bin_seconds: e.target.valueAsNumber })
                  }
                />
                <span className="field-hint">
                  0 keeps observations separate; averaging can blur motion
                </span>
              </label>
              <label className="field">
                Native image quality
                <select
                  className="input"
                  value={value.preparation.native_preview_policy || "masked"}
                  onChange={(e) =>
                    setPrep({
                      native_preview_policy: e.target.value as
                        | "masked"
                        | "inspect_flagged",
                    })
                  }
                >
                  <option value="masked">Mask flagged pixels</option>
                  <option value="inspect_flagged">
                    Inspect flagged pixels
                  </option>
                </select>
              </label>
              <label className="field">
                Minimum wavelength (μm)
                <input
                  className="input"
                  type="number"
                  min="0.7"
                  max="5.5"
                  step="0.001"
                  value={value.wavelength_min_um ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      wavelength_min_um: e.target.value
                        ? e.target.valueAsNumber
                        : null,
                    })
                  }
                />
              </label>
              <label className="field">
                Maximum wavelength (μm)
                <input
                  className="input"
                  type="number"
                  min="0.7"
                  max="5.5"
                  step="0.001"
                  value={value.wavelength_max_um ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      wavelength_max_um: e.target.value
                        ? e.target.valueAsNumber
                        : null,
                    })
                  }
                />
              </label>
            </div>
          </details>
          {error ? (
            <p className="err-summary" role="alert">
              {error}
            </p>
          ) : null}
          {gridWidth > 0 && gridHeight > 0 && (
            <p className="note">
              Processing estimate for up to {value.max_frames} inputs with a{" "}
              {gridWidth} × {gridHeight} pixel comparison grid per input. Larger
              fields can take longer and require more data. Actual transfer
              depends on archive coverage.
              {limits?.total_bytes && limits.wall_seconds
                ? ` This service caps each job at ${Math.floor(limits.total_bytes / 1048576)} MiB of input data and ${limits.wall_seconds} seconds of processing.`
                : ""}
            </p>
          )}
          <div className="tb sky-submit">
            <button className="btn btn-p" type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Prepare sky movie"}
            </button>
            <button
              className="btn btn-s"
              type="button"
              disabled={busy}
              onClick={() => {
                if (validate()) onDiscover(value);
              }}
            >
              Find observation records
            </button>
            <button
              className="btn btn-s"
              type="button"
              onClick={() => {
                if (validate()) onShare(value);
              }}
            >
              Share these coordinates
            </button>
          </div>
        </form>
        <div className="examples">
          <span>Challenge targets:</span>
          <div className="pills">
            {references?.targets.map((t) => (
              <button
                key={t.slug}
                type="button"
                className="pill"
                onClick={() => target(t)}
              >
                {t.name}
              </button>
            ))}
            <button
              type="button"
              className="pill"
              onClick={() => {
                setPreset(null);
                onChange({ ...value, region: { ...DEFAULT_REQUEST.region } });
              }}
            >
              Pinwheel Galaxy (M101)
            </button>
          </div>
        </div>
        {preset ? (
          <p className="note" role="status">
            {preset.name}: catalog position at epoch{" "}
            {preset.reference_epoch_jyear ?? "unknown"}.{" "}
            {Math.abs(preset.pm_ra_cosdec_mas_yr || 0) > 1000
              ? "A wider field is selected to allow for motion. "
              : ""}
            {preset.caveats?.join(" ")}
          </p>
        ) : null}
      </div>
    </Reveal>
  );
}
