import { useState } from "react";
import { Reveal } from "../../components/Reveal";
import { SectionHeader } from "../../components/SectionHeader";
import { apiUrl } from "./api";
import type { Discovery, SourceProduct } from "./types";

interface Props {
  result: Discovery | null;
  loading: boolean;
  error: string;
  onNext: (path: string) => void;
  hasPrevious: boolean;
  onPrevious: () => void;
  onRetry: () => void;
}

function utcDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function utcTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function ObservationDesk({ result }: { result: Discovery }) {
  const [detector, setDetector] = useState("all");
  const [chosenId, setChosenId] = useState("");
  const [showTable, setShowTable] = useState(false);
  const ordered = [...result.items].sort(
    (a, b) =>
      Date.parse(a.start_at_utc) - Date.parse(b.start_at_utc) ||
      a.id.localeCompare(b.id),
  );
  const detectors = Array.from(new Set(ordered.map((p) => p.detector))).sort();
  const filtered =
    detector === "all"
      ? ordered
      : ordered.filter((p) => p.detector === detector);
  const selected = filtered.find((p) => p.id === chosenId) ?? filtered[0];
  const validTimes = filtered.map((p) => Date.parse(p.start_at_utc));
  const minimum = Math.min(...validTimes);
  const maximum = Math.max(...validTimes);
  const usableTimeRange =
    Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum;

  const position = (p: SourceProduct, i: number) => {
    if (usableTimeRange) {
      const time = Date.parse(p.start_at_utc);
      if (Number.isFinite(time))
        return Math.max(
          2,
          Math.min(98, ((time - minimum) / (maximum - minimum)) * 96 + 2),
        );
    }
    return filtered.length <= 1 ? 50 : 2 + (i / (filtered.length - 1)) * 96;
  };

  return (
    <div className="explorer-observation-desk">
      <div
        className="explorer-observation-stats"
        aria-label="Observation summary"
      >
        <div>
          <span>Archive records in this sample</span>
          <strong>{result.sampled_count.toLocaleString()}</strong>
        </div>
        <div>
          <span>Detectors represented</span>
          <strong>{detectors.length}</strong>
        </div>
        <div>
          <span>Earliest observation (UTC)</span>
          <strong className="explorer-stat-date">
            {ordered.length ? utcDate(ordered[0].start_at_utc) : "—"}
          </strong>
        </div>
        <div>
          <span>Latest observation (UTC)</span>
          <strong className="explorer-stat-date">
            {ordered.length
              ? utcDate(ordered[ordered.length - 1].end_at_utc)
              : "—"}
          </strong>
        </div>
      </div>

      {ordered.length ? (
        <div className="explorer-observation-layout">
          <div className="explorer-observation-main">
            <div className="explorer-panel-heading">
              <div>
                <p className="explorer-mini-kicker">OBSERVATION TIMELINE</p>
                <h3>When was this field observed?</h3>
                <p>
                  Select a real archive record to inspect its detector, time and
                  wavelength coverage.
                </p>
              </div>
              <span className="explorer-count-pill">
                {filtered.length} {filtered.length === 1 ? "record" : "records"}
              </span>
            </div>
            {detectors.length > 1 ? (
              <div
                className="explorer-detector-filters"
                role="group"
                aria-label="Filter observations by detector"
              >
                <button
                  type="button"
                  className="explorer-filter"
                  aria-pressed={detector === "all"}
                  onClick={() => setDetector("all")}
                >
                  All detectors
                </button>
                {detectors.map((name) => (
                  <button
                    type="button"
                    className="explorer-filter"
                    aria-pressed={detector === name}
                    onClick={() => setDetector(name)}
                    key={name}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
            <div
              className="explorer-timeline"
              aria-label="Observation dates along a UTC timeline"
            >
              <div className="explorer-timeline-track" aria-hidden="true" />
              {filtered.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  className="explorer-timeline-point"
                  style={{ left: `${position(p, i)}%` }}
                  aria-pressed={selected?.id === p.id}
                  aria-label={`Inspect ${p.detector} observation on ${utcDate(p.start_at_utc)} at ${utcTime(p.start_at_utc)} UTC`}
                  title={`${p.detector} · ${p.start_at_utc}`}
                  onClick={() => setChosenId(p.id)}
                />
              ))}
            </div>
            <div className="explorer-timeline-dates" aria-hidden="true">
              <span>{utcDate(filtered[0].start_at_utc)}</span>
              <span>{utcDate(filtered[filtered.length - 1].start_at_utc)}</span>
            </div>
            <div
              className="explorer-record-rail"
              aria-label="Choose an observation"
            >
              {filtered.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  className="explorer-record-tab"
                  aria-pressed={selected?.id === p.id}
                  onClick={() => setChosenId(p.id)}
                >
                  <span className="explorer-record-tab-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{p.detector}</strong>
                    <small>{utcDate(p.start_at_utc)}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {selected ? (
            <aside
              className="explorer-observation-inspector"
              aria-label="Selected observation details"
              aria-live="polite"
            >
              <p className="explorer-mini-kicker">SELECTED ARCHIVE RECORD</p>
              <h3>{selected.detector}</h3>
              <p className="explorer-inspector-caption">
                {selected.collection} · {selected.release}
              </p>
              <dl className="explorer-record-facts">
                <div>
                  <dt>Observation start · UTC</dt>
                  <dd>{selected.start_at_utc}</dd>
                </div>
                <div>
                  <dt>Observation end · UTC</dt>
                  <dd>{selected.end_at_utc}</dd>
                </div>
                <div>
                  <dt>Wavelength coverage</dt>
                  <dd>
                    {selected.image_wavelength_min_um.toFixed(3)}–
                    {selected.image_wavelength_max_um.toFixed(3)} μm
                  </dd>
                </div>
                <div>
                  <dt>Calibration version</dt>
                  <dd>{selected.calibration_version}</dd>
                </div>
              </dl>
              <a
                className="btn btn-s btn-sm explorer-record-source"
                href={selected.access_url}
                target="_blank"
                rel="noreferrer"
              >
                View source at IRSA ↗
              </a>
              <p className="explorer-record-disclaimer">
                This is archive metadata, not a confirmed detection. Images
                become available through movie preparation.
              </p>
            </aside>
          ) : null}
        </div>
      ) : (
        <div className="explorer-empty-records">
          <h3>No matching observations in this response</h3>
          <p>
            Try a wider sky field, another date range or a different release.
          </p>
        </div>
      )}

      {ordered.length ? (
        <div className="explorer-metadata-expander">
          <button
            type="button"
            className="explorer-table-toggle"
            aria-expanded={showTable}
            aria-controls="explorer-full-observation-table"
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable
              ? "Hide complete record table"
              : "View complete record table"}
            <span aria-hidden="true">{showTable ? "−" : "+"}</span>
          </button>
          <div id="explorer-full-observation-table" hidden={!showTable}>
            <div className="tw">
              <table>
                <caption className="sr-only">
                  Actual observing intervals, detector and source release
                </caption>
                <thead>
                  <tr>
                    <th>Observation interval (UTC)</th>
                    <th>Detector</th>
                    <th>Image wavelength bounds</th>
                    <th>Release</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.start_at_utc}
                        <span className="sub">to {p.end_at_utc}</span>
                      </td>
                      <td>{p.detector}</td>
                      <td>
                        {p.image_wavelength_min_um.toFixed(3)}–
                        {p.image_wavelength_max_um.toFixed(3)} μm
                      </td>
                      <td>
                        {p.release}
                        <span className="sub">{p.calibration_version}</span>
                      </td>
                      <td>
                        <a
                          className="srclink"
                          href={p.access_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          IRSA product ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DiscoveryResults({
  result,
  loading,
  error,
  onNext,
  hasPrevious,
  onPrevious,
  onRetry,
}: Props) {
  if (!result && !loading && !error) return null;
  return (
    <Reveal id="records">
      <SectionHeader
        eyebrow="02 / REVIEW OBSERVATIONS"
        title="What the archive observed"
        lead="Explore actual SPHEREx observation times, detectors and spectral coverage before opening the images."
        chip={
          result ? (
            <span className="chip chip-info">
              {result.sampled_count} IN SAMPLE
            </span>
          ) : undefined
        }
      />
      {loading ? (
        <p className="state" role="status">
          {result
            ? "Loading next records… Previous records remain visible."
            : "Searching SPHEREx archive records…"}
        </p>
      ) : null}
      {error ? (
        <div className="state state-error" role="alert">
          <p>{error}</p>
          <button className="btn btn-s btn-sm" onClick={onRetry}>
            Retry record search
          </button>
        </div>
      ) : null}
      {result ? (
        <>
          <ObservationDesk
            key={
              result.snapshot_id + ":" + result.items.map((p) => p.id).join("|")
            }
            result={result}
          />
          <p className="explorer-archive-status">
            {result.upstream_complete
              ? "Archive response complete at retrieval."
              : "Partial archive sample: the provider may omit some records, even after pagination."}{" "}
            Retrieved {new Date(result.created_at_utc).toLocaleString()}.
          </p>
          {result.warnings.length > 0 ? (
            <details className="sky-details explorer-archive-warnings">
              <summary>Archive notices ({result.warnings.length})</summary>
              <ul className="note" aria-label="Archive warnings">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="tb explorer-observation-actions">
            {hasPrevious ? (
              <button
                type="button"
                className="btn btn-s btn-sm"
                disabled={loading}
                onClick={onPrevious}
              >
                ← Previous records
              </button>
            ) : null}
            {result.next_page ? (
              <button
                type="button"
                className="btn btn-s btn-sm"
                disabled={loading}
                onClick={() => onNext(result.next_page!)}
              >
                Next records →
              </button>
            ) : null}
            <a
              className="srclink"
              href={apiUrl(
                `/api/v1/observations/snapshots/${result.snapshot_id}?limit=100`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Open immutable metadata snapshot ↗
            </a>
          </div>
        </>
      ) : null}
    </Reveal>
  );
}
