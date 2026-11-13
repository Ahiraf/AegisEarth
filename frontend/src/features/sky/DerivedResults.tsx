import { scrollToId } from "../../lib/scroll";
import { apiUrl } from "./api";
import type { DerivedTask } from "./useDerivedJobs";
import type { Artifact, Sample } from "./types";

const artifactURL = (artifact: Artifact) =>
  apiUrl(artifact.url || `/api/v1/artifacts/${artifact.id}/content`);
function SpectrumPlot({ samples }: { samples: Sample[] }) {
  const points = samples.filter(
    (
      s,
    ): s is Sample & {
      wavelength_um: number;
      flux_uJy: number;
      flux_error_uJy: number;
    } =>
      s.wavelength_um !== null &&
      s.flux_uJy !== null &&
      s.flux_error_uJy !== null,
  );
  if (!points.length)
    return (
      <div className="sky-empty-spectrum">
        <h4>No brightness measurement to plot</h4>
        {samples.some(s => s.reason === "masked_aperture_or_insufficient_clean_background") && (
          <p>The telescope recorded a wavelength, but the source area had too few usable pixels or the surrounding sky had too few clean pixels to estimate the background.</p>
        )}
        {samples.some(s => s.reason === "background_annulus_outside_cutout" || s.reason === "position_outside_input") && (
          <p>The selected position or the ring of sky needed to measure the background extends outside an observation.</p>
        )}
        <p>{samples.length ? "Check the reason for each observation below." : "This extraction returned no samples."} To measure the same target, select another observation covering it and run the extraction again. To inspect a different source, choose its position in the movie at Fit zoom.</p>
        <div className="tb">
          <button type="button" className="btn btn-s btn-sm" onClick={() => scrollToId("processing", true)}>Review extraction settings</button>
          <button type="button" className="btn btn-s btn-sm" onClick={() => scrollToId("movie", true)}>Choose a sky position</button>
        </div>
      </div>
    );
  const lo = Math.min(
    ...points.map(
      (p) => p.wavelength_um - Math.max(0.05, (p.bandwidth_um || 0) / 2),
    ),
  );
  const hi = Math.max(
    ...points.map(
      (p) => p.wavelength_um + Math.max(0.05, (p.bandwidth_um || 0) / 2),
    ),
  );
  const bottom = Math.min(
    0,
    ...points.map((p) => p.flux_uJy - p.flux_error_uJy),
  );
  const top = Math.max(1, ...points.map((p) => p.flux_uJy + p.flux_error_uJy));
  const x = (v: number) => 70 + ((v - lo) / (hi - lo)) * 620;
  const y = (v: number) => 260 - ((v - bottom) / (top - bottom)) * 210;
  return (
    <figure className="sky-spectrum">
      <svg
        viewBox="0 0 760 320"
        role="img"
        aria-label="Sparse diagnostic flux samples by wavelength, separate epochs with approximate error bars"
      >
        <line x1="70" y1="260" x2="700" y2="260" className="sky-axis" />
        <line x1="70" y1="40" x2="70" y2="260" className="sky-axis" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <text x={70 + t * 620} y="282" textAnchor="middle">
              {(lo + t * (hi - lo)).toFixed(2)}
            </text>
            <text x="62" y={260 - t * 210} textAnchor="end">
              {(bottom + t * (top - bottom)).toPrecision(3)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.product_id} className={`sky-point epoch-${i % 6}`}>
            <title>
              {p.observed_at_utc || p.mid_mjd_utc}: {p.flux_uJy} ±{" "}
              {p.flux_error_uJy} μJy
            </title>
            <line
              x1={x(p.wavelength_um)}
              x2={x(p.wavelength_um)}
              y1={y(p.flux_uJy - p.flux_error_uJy)}
              y2={y(p.flux_uJy + p.flux_error_uJy)}
            />
            {p.bandwidth_um !== null ? (
              <line
                x1={x(p.wavelength_um - p.bandwidth_um / 2)}
                x2={x(p.wavelength_um + p.bandwidth_um / 2)}
                y1={y(p.flux_uJy)}
                y2={y(p.flux_uJy)}
              />
            ) : null}
            <circle cx={x(p.wavelength_um)} cy={y(p.flux_uJy)} r="5" />
          </g>
        ))}
        <text x="380" y="310" textAnchor="middle">
          Wavelength proxy (μm)
        </text>
        <text x="17" y="165" textAnchor="middle" transform="rotate(-90 17 165)">
          Diagnostic flux (μJy)
        </text>
      </svg>
      <figcaption className="note">
        Measured samples only; epochs stay separate. Bars show approximate
        errors and wavelength width. Missing channels are not interpolated.
      </figcaption>
    </figure>
  );
}
export function DerivedResults({
  task,
  onRetry,
  onCancel,
}: {
  task: DerivedTask;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const report = task.result;
  const active = ["submitting", "queued", "running"].includes(task.phase);
  const publicArtifacts =
    report?.artifacts.filter(
      (a) => !["source_common_grid", "derived_report"].includes(a.kind || ""),
    ) || [];
  return (
    <article className="card sky-job-result" aria-label={`${task.kind} job`}>
      <div className="sh">
        <h3>{task.kind}</h3>
        <span
          className={`chip ${task.phase === "ready" ? "chip-info" : "chip-plain"}`}
        >
          {task.phase === "ready"
            ? report?.outcome.replaceAll("_", " ")
            : task.phase}
        </span>
      </div>
      {active ? (
        <p role="status">
          {task.phase === "submitting"
            ? "Submitting a bounded processing job…"
            : `Job ${task.receipt?.id.slice(0, 8) || ""} · ${task.phase}. You can continue browsing.`}
        </p>
      ) : null}
      {task.error ? (
        <p className="field-error" role="alert">
          {task.error}
        </p>
      ) : null}
      <div className="tb">
        {task.phase === "error" ? (
          <button className="btn btn-s btn-sm" onClick={onRetry}>
            {task.receipt ? "Check job again" : "Retry submission"}
          </button>
        ) : null}
        {active && task.receipt?.cancel_token ? (
          <button className="btn btn-s btn-sm" onClick={onCancel}>
            Cancel {task.kind.toLowerCase()}
          </button>
        ) : null}
        {task.receipt ? (
          <a
            className="srclink"
            href={apiUrl(task.receipt.status_url)}
            target="_blank"
            rel="noreferrer"
          >
            Job status ↗
          </a>
        ) : null}
      </div>
      {report?.groups?.map((group, i) => (
        <div key={i} className="sky-derived-group">
          <h4>
            Group {i + 1} · {group.status.replaceAll("_", " ")}
          </h4>
          {group.reasons?.length ? (
            <ul className="note">
              {group.reasons.map((r) => (
                <li key={r}>{r.replaceAll("_", " ")}</li>
              ))}
            </ul>
          ) : null}
          {group.artifact_indices?.preview !== undefined ? (
            <img
              className="sky-derived-preview"
              src={artifactURL(
                report.artifacts[group.artifact_indices.preview],
              )}
              alt={`Coadd group ${i + 1}, ${group.unit || "intensity"}; display-only combination`}
            />
          ) : null}
          {group.warnings?.length ? (
            <details className="sky-details">
              <summary>Combination limits</summary>
              <ul className="note">
                {group.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ))}
      {report?.eligibility ? (
        <div className="sky-science-note">
          <strong>
            {report.eligibility.eligible
              ? "Eligible signed difference"
              : "This pair is not eligible for scientific subtraction"}
          </strong>
          <ul className="note">
            {report.eligibility.reasons.map((r) => (
              <li key={r}>{r.replaceAll("_", " ")}</li>
            ))}
          </ul>
          <p className="note">
            The original sky images remain available for browsing.
          </p>
        </div>
      ) : null}
      {report?.samples ? (
        <>
          <p className="sky-science-note">
            Diagnostic extraction · calibration, response, covariance and
            source-model acceptance are incomplete. These values do not
            establish a detection or calibrated brightness change.
          </p>
          <SpectrumPlot samples={report.samples} />
          <div className="tw">
            <table>
              <caption className="sr-only">
                Separate-epoch diagnostic spectrum samples
              </caption>
              <thead>
                <tr>
                  <th>Epoch UTC / MJD</th>
                  <th>Detector</th>
                  <th>Wavelength</th>
                  <th>Flux ± error</th>
                  <th>Quality / reason</th>
                </tr>
              </thead>
              <tbody>
                {report.samples.map((s) => (
                  <tr key={s.product_id}>
                    <td>{s.observed_at_utc || s.mid_mjd_utc}</td>
                    <td>{s.detector}</td>
                    <td>{s.wavelength_um?.toFixed(4) ?? "Unavailable"} μm</td>
                    <td>
                      {s.flux_uJy === null
                        ? "Unavailable"
                        : `${s.flux_uJy.toPrecision(5)} ± ${s.flux_error_uJy?.toPrecision(3) ?? "unknown"} μJy`}
                    </td>
                    <td>
                      {s.status.replaceAll("_", " ")}
                      <span className="sub">
                        {s.reason.replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {report?.gif_artifact_index !== undefined ? (
        <img
          className="sky-gif-preview"
          src={artifactURL(report.artifacts[report.gif_artifact_index])}
          alt="Captioned SPHEREx chronological display export"
        />
      ) : null}
      {report?.kind === "export" ? (
        <p className="note">
          Display timing is separate from elapsed observing time. The provenance
          download retains each input’s date, band, grid and source hash.
        </p>
      ) : null}
      {publicArtifacts.length ? (
        <div className="sky-downloads tb">
          {publicArtifacts.map((a) => (
            <a key={a.id} className="btn btn-s btn-sm" href={artifactURL(a)}>
              Download {(a.kind || a.content_type).replaceAll("_", " ")} ·{" "}
              {a.size_bytes < 1024 ? a.size_bytes + " B" : (a.size_bytes / 1024).toFixed(1) + " KB"}
            </a>
          ))}
        </div>
      ) : null}
      {task.receipt?.result_url && report ? (
        <a
          className="srclink"
          href={apiUrl(task.receipt.result_url)}
          target="_blank"
          rel="noreferrer"
        >
          Full result and provenance JSON ↗
        </a>
      ) : null}
    </article>
  );
}
