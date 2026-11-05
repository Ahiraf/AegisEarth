import { useState } from "react";
import { Reveal } from "../../components/Reveal";
import { SectionHeader } from "../../components/SectionHeader";
import { errorMessage, get, post } from "./api";
import { DerivedResults } from "./DerivedResults";
import type { SkyPosition } from "./MoviePlayer";
import type { DetectorOptions, InputRef, Preparation } from "./types";
import { useDerivedJobs } from "./useDerivedJobs";

interface Props {
  id: string;
  preparation?: Preparation;
  options?: DetectorOptions;
  position: SkyPosition | null;
  center: SkyPosition;
  onPosition: (position: SkyPosition) => void;
}
export function ProcessingTools({
  id,
  preparation,
  options,
  position,
  center,
  onPosition,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState("coadd");
  const [detector, setDetector] = useState("D6");
  const [combine, setCombine] = useState("detector_composite");
  const [minimum, setMinimum] = useState(1);
  const [window, setWindow] = useState(300);
  const [low, setLow] = useState(0.7);
  const [high, setHigh] = useState(5.5);
  const [aperture, setAperture] = useState(2.5);
  const [inner, setInner] = useState(4);
  const [outer, setOuter] = useState(8);
  const [perEpoch, setPerEpoch] = useState(false);
  const [positions, setPositions] = useState<Record<string, SkyPosition>>({});
  const [duration, setDuration] = useState(700);
  const [loop, setLoop] = useState(false);
  const [error, setError] = useState("");
  const [preflight, setPreflight] = useState<{
    eligibility: { eligible: boolean; reasons: string[] };
  } | null>(null);
  const [related, setRelated] = useState<
    { id: string; preparation: Preparation }[]
  >([]);
  const [additionalId, setAdditionalId] = useState("");
  const [adding, setAdding] = useState(false);
  const jobs = useDerivedJobs();
  const frames = [
    ...(preparation?.frames || []).map((f) => ({
      ...f,
      view_id: id,
      key: `${id}:${f.index}`,
    })),
    ...related.flatMap((view) =>
      view.preparation.frames.map((f) => ({
        ...f,
        view_id: view.id,
        key: `${view.id}:${f.index}`,
      })),
    ),
  ];
  const chosen = selected.filter((key) => frames.some((f) => f.key === key));
  const current = position || center;
  function sourceLabel(key: string) {
    const source = frames.find((f) => f.key === key);
    return source ? `${source.index + 1} · ${source.view_id.slice(0, 8)}` : key;
  }
  async function addSources() {
    setError("");
    const value = additionalId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(value)) {
      setError("Enter a valid prepared-view UUID.");
      return;
    }
    if (value === id || related.some((v) => v.id === value)) {
      setError("That view is already in the source list.");
      return;
    }
    if (related.length >= 5) {
      setError("At most six source views can be combined.");
      return;
    }
    setAdding(true);
    try {
      const report = await get<Preparation>(
        `/api/v1/views/${value}/preparation`,
      );
      if (report.version !== "frames-v1")
        throw new Error("Choose an unexpired prepared sky view.");
      setRelated((items) => [...items, { id: value, preparation: report }]);
      setAdditionalId("");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setAdding(false);
    }
  }

  const inputs: InputRef[] = chosen.map((key) => {
    const source = frames.find((f) => f.key === key)!;
    return { view_id: source.view_id, index: source.index };
  });
  const available = frames.some((f) => f.detector === detector);
  function run() {
    setError("");
    if (!inputs.length) {
      setError("Select at least one source observation.");
      return;
    }
    if (inputs.length > 12) {
      setError("Select at most twelve source observations.");
      return;
    }
    if (!inputs.some((ref) => ref.view_id === id)) {
      setError("Include at least one source from the current sky view.");
      return;
    }
    if (
      new Set(
        chosen.map((key) => frames.find((f) => f.key === key)!.product_id),
      ).size < chosen.length
    ) {
      setError(
        "Choose each physical source product only once across all views.",
      );
      return;
    }
    if (tab === "coadd") {
      if (!available) {
        setError(
          `This view has no ${detector} inputs. Prepare a view for that detector first.`,
        );
        return;
      }
      if (
        !chosen.some(
          (i) => frames.find((f) => f.key === i)?.detector === detector,
        )
      ) {
        setError("Select source images belonging to the chosen detector.");
        return;
      }
      if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high) {
        setError("Choose an ordered wavelength window.");
        return;
      }
      jobs.start("Detector composite", `/api/v1/views/${id}/coadds`, {
        contract_version: "coadd-v1",
        inputs,
        detector,
        mode: combine,
        epoch_window_seconds: window,
        wavelength_min_um: low,
        wavelength_max_um: high,
        minimum_contributors: minimum,
      });
    } else if (tab === "difference") {
      if (inputs.length !== 2) {
        setError("Select exactly two distinct source observations.");
        return;
      }
      jobs.start("Signed difference", `/api/v1/views/${id}/differences`, {
        contract_version: "difference-v1",
        inputs,
      });
    } else if (tab === "spectrum") {
      if (outer <= inner) {
        setError("The background outer radius must exceed the inner radius.");
        return;
      }
      const points = perEpoch
        ? inputs.map((ref, i) => ({ ...ref, ...positions[chosen[i]] }))
        : [];
      if (
        perEpoch &&
        points.some(
          (p) => !Number.isFinite(p.ra_deg) || !Number.isFinite(p.dec_deg),
        )
      ) {
        setError("Enter a sky position for every selected epoch.");
        return;
      }
      if (
        !perEpoch &&
        (!Number.isFinite(current.ra_deg) || !Number.isFinite(current.dec_deg))
      ) {
        setError("Choose a finite sky coordinate for extraction.");
        return;
      }
      jobs.start("Diagnostic spectrum", `/api/v1/views/${id}/spectra`, {
        contract_version: "spectrum-v1",
        inputs,
        ...(perEpoch
          ? { epoch_positions: points }
          : { position: { ra_deg: current.ra_deg, dec_deg: current.dec_deg } }),
        aperture_radius_pixels: aperture,
        background_inner_pixels: inner,
        background_outer_pixels: outer,
      });
    } else
      jobs.start("Movie export", `/api/v1/views/${id}/exports`, {
        contract_version: "export-v1",
        inputs,
        frame_duration_ms: duration,
        loop,
      });
  }
  async function validatePair() {
    setError("");
    setPreflight(null);
    if (inputs.length !== 2) {
      setError("Select exactly two source observations to validate.");
      return;
    }
    try {
      setPreflight(
        await post("/api/v1/comparisons/validate", {
          contract_version: "comparison-v1",
          inputs,
        }),
      );
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <Reveal id="processing">
      <SectionHeader
        eyebrow="04 / Explore the evidence"
        title="Combine, compare and extract"
        lead="Derived jobs use verified numeric source images. The chronological viewer stays independent."
      />
      <div className="card">
        <div className="pills" role="group" aria-label="Processing operation">
          {[
            ["coadd", "Detector composites"],
            ["difference", "Signed difference"],
            ["spectrum", "Diagnostic spectra"],
            ["export", "Movie export"],
          ].map(([key, label]) => (
            <button
              className="pill"
              aria-pressed={tab === key}
              key={key}
              onClick={() => {
                setTab(key);
                setError("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <fieldset className="sky-source-selection">
          <legend>Source observations · {chosen.length} selected</legend>
          <div className="tb">
            <button
              className="btn btn-s btn-sm"
              disabled={!frames.length}
              onClick={() => setSelected(frames.map((f) => f.key))}
            >
              Select all sources
            </button>
            <button
              className="btn btn-s btn-sm"
              onClick={() => setSelected([])}
            >
              Clear sources
            </button>
          </div>
          {frames.length ? (
            <div className="sky-source-list">
              {frames.map((f) => (
                <label className="check-line" key={f.key}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(f.key)}
                    onChange={(e) => {
                      setPreflight(null);
                      setSelected((previous) =>
                        e.target.checked
                          ? [...previous, f.key]
                          : previous.filter((i) => i !== f.key),
                      );
                    }}
                  />
                  <span>
                    Source {f.index + 1} · {f.detector} · view{" "}
                    {f.view_id.slice(0, 8)}
                    <span className="sub mono">
                      UTC MJD {f.mid_mjd.toFixed(6)} ·{" "}
                      {f.product_id.slice(0, 12)}…
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="note">
              Prepared source metadata will appear here when the view is ready.
            </p>
          )}
        </fieldset>
        <details className="sky-details">
          <summary>Add source observations from another prepared view</summary>
          <p className="note">
            Use views of the same RA/Dec, field size and preparation grid. Up to
            six views and twelve distinct physical exposures may be combined.
            Each operation must include a source from the current view.
          </p>
          <div className="tb">
            <label className="field">
              Additional prepared view ID
              <input
                className="input mono"
                value={additionalId}
                onChange={(e) => setAdditionalId(e.target.value)}
                placeholder="Prepared view UUID"
              />
            </label>
            <button
              className="btn btn-s btn-sm"
              disabled={adding}
              onClick={() => void addSources()}
            >
              {adding ? "Loading sources…" : "Add view sources"}
            </button>
          </div>
          {related.map((view) => (
            <p className="note" key={view.id}>
              View {view.id} · {view.preparation.frames.length} sources
            </p>
          ))}
        </details>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          {tab === "coadd" ? (
            <>
              <div className="sky-options-grid">
                <label className="field">
                  Composite detector
                  <select
                    aria-label="Composite detector"
                    className="input"
                    value={detector}
                    onChange={(e) => setDetector(e.target.value)}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => {
                      const item = {
                        availability: frames.some((f) => f.detector === `D${n}`)
                          ? "available"
                          : "not_in_acquired_sample",
                      };
                      return (
                        <option key={n} value={`D${n}`}>
                          D{n}
                          {item?.availability === "available"
                            ? " · available"
                            : " · not in this view"}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="field">
                  Combination
                  <select
                    className="input"
                    value={combine}
                    onChange={(e) => setCombine(e.target.value)}
                  >
                    <option value="detector_composite">
                      Per detector / epoch composite
                    </option>
                    <option value="temporal_mean">
                      Explicit temporal mean
                    </option>
                    <option value="weighted_sum">
                      Count-scaled weighted sum
                    </option>
                  </select>
                </label>
                <label className="field">
                  Epoch grouping (seconds)
                  <input
                    className="input"
                    required
                    type="number"
                    min="0"
                    max="300"
                    value={window}
                    onChange={(e) => setWindow(e.target.valueAsNumber)}
                  />
                </label>
                <label className="field">
                  Minimum contributors
                  <input
                    className="input"
                    required
                    type="number"
                    min="1"
                    max="12"
                    value={minimum}
                    onChange={(e) => setMinimum(e.target.valueAsNumber)}
                  />
                </label>
                <label className="field">
                  Wavelength from (μm)
                  <input
                    className="input"
                    required
                    type="number"
                    min="0.7"
                    max="5.5"
                    step="0.001"
                    value={low}
                    onChange={(e) => setLow(e.target.valueAsNumber)}
                  />
                </label>
                <label className="field">
                  Wavelength to (μm)
                  <input
                    className="input"
                    required
                    type="number"
                    min="0.7"
                    max="5.5"
                    step="0.001"
                    value={high}
                    onChange={(e) => setHigh(e.target.valueAsNumber)}
                  />
                </label>
              </div>
              <p className="note">
                Each view commonly contains one detector. Prepare separate
                detector views to explore D1–D6. Temporal stacking can blur
                movers and dilute variability. A count-one image gains no
                coaddition sensitivity.
              </p>
            </>
          ) : null}
          {tab === "difference" ? (
            <div className="sky-science-note">
              <h3>Later minus earlier</h3>
              <p>
                Two source epochs are ordered by their actual observing time.
                Response, PSF, background, registration and noise validation
                determine whether a difference image can be produced.
              </p>
              <p className="note">
                Current real preparation does not establish science-grade
                subtraction. You can inspect the eligibility reasons without
                losing access to the original images.
              </p>
              <button
                className="btn btn-s btn-sm"
                type="button"
                onClick={() => void validatePair()}
              >
                Check pair eligibility
              </button>
              {preflight ? (
                <div role="status">
                  <strong>
                    {preflight.eligibility.eligible
                      ? "Pair eligible"
                      : "Pair blocked"}
                  </strong>
                  <ul className="note">
                    {preflight.eligibility.reasons.map((r) => (
                      <li key={r}>{r.replaceAll("_", " ")}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          {tab === "spectrum" ? (
            <>
              <p className="sky-science-note">
                Point-source aperture measurements are diagnostic, with
                approximate errors. Epochs remain separate; no missing channels
                or upper limits are invented.
              </p>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={perEpoch}
                  onChange={(e) => setPerEpoch(e.target.checked)}
                />
                Use explicit positions for a moving source at each epoch
              </label>
              {!perEpoch ? (
                <div className="sky-options-grid">
                  <label className="field">
                    Extraction RA (degrees)
                    <input
                      className="input"
                      type="number"
                      required
                      min="0"
                      max="359.999999999"
                      step="any"
                      value={current.ra_deg}
                      onChange={(e) =>
                        onPosition({
                          ...current,
                          ra_deg: e.target.valueAsNumber,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Extraction Dec (degrees)
                    <input
                      className="input"
                      type="number"
                      required
                      min="-90"
                      max="90"
                      step="any"
                      value={current.dec_deg}
                      onChange={(e) =>
                        onPosition({
                          ...current,
                          dec_deg: e.target.valueAsNumber,
                        })
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className="sky-epoch-positions">
                  {chosen.map((index) => (
                    <fieldset className="sky-fieldset" key={index}>
                      <legend>Source {sourceLabel(index)}</legend>
                      <div className="sky-options-grid">
                        <label className="field">
                          RA for source {sourceLabel(index)}
                          <input
                            className="input"
                            type="number"
                            required
                            min="0"
                            max="359.999999999"
                            step="any"
                            value={positions[index]?.ra_deg ?? ""}
                            onChange={(e) =>
                              setPositions((p) => ({
                                ...p,
                                [index]: {
                                  ...p[index],
                                  ra_deg: e.target.valueAsNumber,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          Dec for source {sourceLabel(index)}
                          <input
                            className="input"
                            type="number"
                            required
                            min="-90"
                            max="90"
                            step="any"
                            value={positions[index]?.dec_deg ?? ""}
                            onChange={(e) =>
                              setPositions((p) => ({
                                ...p,
                                [index]: {
                                  ...p[index],
                                  dec_deg: e.target.valueAsNumber,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}
              <div className="sky-options-grid">
                <label className="field">
                  Aperture radius (native pixels)
                  <input
                    className="input"
                    type="number"
                    required
                    min="1"
                    max="3"
                    step="0.1"
                    value={aperture}
                    onChange={(e) => setAperture(e.target.valueAsNumber)}
                  />
                </label>
                <label className="field">
                  Background inner radius
                  <input
                    className="input"
                    type="number"
                    required
                    min="3.5"
                    max="8"
                    step="0.1"
                    value={inner}
                    onChange={(e) => setInner(e.target.valueAsNumber)}
                  />
                </label>
                <label className="field">
                  Background outer radius
                  <input
                    className="input"
                    type="number"
                    required
                    min="5"
                    max="12"
                    step="0.1"
                    value={outer}
                    onChange={(e) => setOuter(e.target.valueAsNumber)}
                  />
                </label>
              </div>
            </>
          ) : null}
          {tab === "export" ? (
            <>
              <div className="sky-options-grid">
                <label className="field">
                  GIF frame duration (ms)
                  <input
                    className="input"
                    type="number"
                    required
                    min="100"
                    max="2000"
                    step="100"
                    value={duration}
                    onChange={(e) => setDuration(e.target.valueAsNumber)}
                  />
                </label>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={loop}
                    onChange={(e) => setLoop(e.target.checked)}
                  />
                  Loop exported GIF
                </label>
              </div>
              <p className="note">
                A bounded GIF uses shared scaling, UTC/band/quality captions and
                a source-provenance sidecar. One source produces a static image.
              </p>
            </>
          ) : null}
          {error ? (
            <p className="err-summary" role="alert">
              {error}
            </p>
          ) : null}
          <div className="tb sky-submit">
            <button
              className="btn btn-p"
              type="submit"
              disabled={jobs.busy || !frames.length}
            >
              {jobs.busy
                ? "Processing…"
                : tab === "coadd"
                  ? "Build composite"
                  : tab === "difference"
                    ? "Request signed difference"
                    : tab === "spectrum"
                      ? "Extract diagnostic spectrum"
                      : "Create GIF export"}
            </button>
          </div>
        </form>
      </div>
      <div className="sky-job-results">
        {jobs.tasks.map((task) => (
          <DerivedResults
            key={task.localId}
            task={task}
            onRetry={() => void jobs.retry(task)}
            onCancel={() => void jobs.stop(task)}
          />
        ))}
      </div>
    </Reveal>
  );
}
