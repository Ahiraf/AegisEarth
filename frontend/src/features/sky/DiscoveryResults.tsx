import { Reveal } from "../../components/Reveal";
import { SectionHeader } from "../../components/SectionHeader";
import { apiUrl } from "./api";
import type { Discovery } from "./types";

interface Props {
  result: Discovery | null;
  loading: boolean;
  error: string;
  onNext: (path: string) => void;
  onRetry: () => void;
}
export function DiscoveryResults({
  result,
  loading,
  error,
  onNext,
  onRetry,
}: Props) {
  if (!result && !loading && !error) return null;
  return (
    <Reveal id="records">
      <SectionHeader
        eyebrow="02 / Archive discovery"
        title="Observation records"
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
          Finding archive records…
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
          <p className="help">
            {result.upstream_complete
              ? "The queried metadata response is complete at retrieval."
              : "This is an incomplete archive sample; pagination cannot recover records omitted by the archive."}{" "}
            Checked {new Date(result.created_at_utc).toLocaleString()}.
          </p>
          {result.items.length ? (
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
                  {result.items.map((p) => (
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
          ) : (
            <p className="state">
              No observations were returned in this query. Try a wider field or
              other dates.
            </p>
          )}
          <ul className="note">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="tb">
            {result.next_page ? (
              <button
                className="btn btn-s btn-sm"
                disabled={loading}
                onClick={() => onNext(result.next_page!)}
              >
                Next records
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
