import { useEffect, useRef, useState } from "react";
import { delay, errorMessage, get, post } from "./api";

export interface RankedCandidate {
  id: string;
  name: string;
  classification: "possible_motion" | "uncertain";
  score: number | null;
  score_uncertainty: number | null;
  warnings: string[];
  evidence: {
    v_mag: number | null;
    n_frames_used: number;
    warning_messages: string[];
    frames: {
      product_id?: string;
      mid_mjd: number;
      ra_deg: number;
      dec_deg: number;
      used_for_score: boolean;
      reasons?: string[];
    }[];
  };
}
export interface RankerResult {
  method: "metadata_ranker";
  cutout_policy?: string;
  candidates: RankedCandidate[];
  warnings: string[];
  model: { version: string };
  acquisition?: { cutout_downloads: number; wall_seconds: number };
}
interface Analysis {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  result: RankerResult | null;
  error_code: string | null;
  expired?: boolean;
}
const FAINT = "PREDICTED_FAINTER_THAN_TRAINING_RANGE";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function CandidateCard({ candidate }: { candidate: RankedCandidate }) {
  return (
    <article className="panel ranker-candidate">
      <h4>{candidate.name}</h4>
      <p>
        Predicted V magnitude:{" "}
        {candidate.evidence.v_mag?.toFixed(2) ?? "unknown"} ·{" "}
        {candidate.classification === "possible_motion"
          ? "Possible motion"
          : "Uncertain"}
      </p>
      <p>
        <strong>
          {candidate.score === null
            ? "Unscored"
            : `Candidate rank: ${candidate.score.toFixed(4)}`}
        </strong>
        {candidate.score_uncertainty !== null && (
          <> · Ensemble spread: {candidate.score_uncertainty.toFixed(4)}</>
        )}
      </p>
      <p>
        {candidate.evidence.n_frames_used} usable frames reported by the ranker.
      </p>
      <ul>
        {candidate.evidence.warning_messages.map((message, i) => (
          <li key={i}>{message}</li>
        ))}
      </ul>
      <details>
        <summary>Predicted positions and frame evidence</summary>
        <ul className="ranker-frame-list">
          {candidate.evidence.frames.map((f, i) => (
            <li key={`${f.mid_mjd}-${i}`}>
              UTC MJD {f.mid_mjd.toFixed(6)} · RA {f.ra_deg.toFixed(5)}°, Dec{" "}
              {f.dec_deg.toFixed(5)}°
              <br />
              {f.used_for_score
                ? "Used for score"
                : (f.reasons ?? ["Not used"])
                    .map((reason) => reason.replaceAll("_", " ").toLowerCase())
                    .join("; ")}
              {f.product_id && (
                <>
                  <br />
                  <small>Product: {f.product_id}</small>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
export function RankerResults({ result }: { result: RankerResult }) {
  const sorted = [...result.candidates].sort(
    (a, b) => (a.evidence.v_mag ?? Infinity) - (b.evidence.v_mag ?? Infinity),
  );
  const bright = sorted.filter((c) => !c.warnings.includes(FAINT));
  const faint = sorted.filter((c) => c.warnings.includes(FAINT));
  return (
    <div className="ranker-results">
      <p className="note">
        {result.model.version} · Uncalibrated ranks, not probabilities. Only the
        5% false-alert operating threshold has been validated. The 10% flag is
        informational.
      </p>
      {result.cutout_policy !== "per_candidate_centered_v1" && (
        <p className="note">
          This analysis uses an older cutout policy. Start a new optional
          analysis for candidate-centred results.
        </p>
      )}
      {result.warnings.includes("CANDIDATE_LIMIT_REACHED") && (
        <p role="status">
          The processing limit was reached. Some known objects were retained
          without scores; inspect their warnings.
        </p>
      )}
      {bright.length > 0 && (
        <div aria-label="Bright candidate results">
          {bright.map((c) => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </div>
      )}
      {faint.length > 0 && (
        <details className="ranker-faint">
          <summary>
            Known objects too faint for this ranker ({faint.length})
          </summary>
          <p>
            {result.cutout_policy === "per_candidate_centered_v1"
              ? "No cutouts were downloaded and no model scores were computed for these objects. Their predicted positions remain available."
              : "These known objects are outside the trained brightness range. This older analysis may have downloaded or scored them."}
          </p>
          {faint.map((c) => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </details>
      )}
      {sorted.length === 0 && (
        <p>
          No known candidate tracks were returned. This does not establish that
          the field contains no moving objects.
        </p>
      )}
    </div>
  );
}
export function MetadataRanker({
  snapshotId,
  enabled,
}: {
  snapshotId?: string;
  enabled: boolean;
}) {
  const [openId, setOpenId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function run(create: boolean) {
    if (!create && !UUID.test(openId.trim())) {
      setError("Enter a valid analysis UUID.");
      return;
    }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setError("");
    setAnalysis(null);
    setPending(true);
    try {
      const id = create
        ? (
            await post<{ id: string }>(
              "/api/v1/analyses",
              {
                contract_version: "metadata-ranker-v1",
                method: "metadata_ranker",
                snapshot_id: snapshotId,
                visit_index: 0,
                max_exposures: 12,
              },
              active.signal,
              crypto.randomUUID(),
            )
          ).id
        : openId.trim();
      while (!active.signal.aborted) {
        const status = await get<Analysis>(
          `/api/v1/analyses/${id}`,
          active.signal,
        );
        if (active.signal.aborted) return;
        setAnalysis(status);
        if (status.status !== "queued" && status.status !== "running") break;
        await delay(3000, active.signal);
      }
    } catch (e) {
      if (!active.signal.aborted) setError(errorMessage(e));
    } finally {
      if (!active.signal.aborted) setPending(false);
    }
  }
  return (
    <section id="model" className="sky-section" aria-labelledby="ranker-title">
      <h2 id="ranker-title">Optional known-object hints</h2>
      <p className="note">
        The sky movie works independently. This optional analysis follows
        predicted known objects through native images; it does not confirm
        discoveries. It excludes the five preset targets.
      </p>
      <div className="tb">
        <button
          className="btn btn-s"
          type="button"
          disabled={!enabled || !snapshotId || pending}
          onClick={() => void run(true)}
        >
          Rank known objects in this search
        </button>
        {!enabled && (
          <span className="note">
            Optional ranker is switched off or unavailable.
          </span>
        )}
        {enabled && !snapshotId && (
          <span className="note">
            Find observations for an ordinary sky field first.
          </span>
        )}
      </div>
      <details>
        <summary>Open an existing optional analysis</summary>
        <label htmlFor="ranker-analysis-id">Analysis UUID</label>
        <input
          id="ranker-analysis-id"
          value={openId}
          onChange={(e) => setOpenId(e.target.value)}
          autoComplete="off"
        />
        <button
          className="btn btn-s"
          type="button"
          disabled={pending}
          onClick={() => void run(false)}
        >
          Load analysis
        </button>
      </details>
      {pending && (
        <p role="status">
          Optional analysis {analysis?.status ?? "starting"}… Native cutouts and
          SkyBoT are processed in the background.
        </p>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {analysis?.status === "failed" && (
        <p role="status">
          Optional analysis failed: {analysis.error_code?.replaceAll("_", " ")}.
          The viewer remains available.
        </p>
      )}
      {analysis?.status === "canceled" && (
        <p role="status">Optional analysis was canceled.</p>
      )}
      {analysis?.expired && <p role="status">This analysis has expired.</p>}
      {analysis?.result && <RankerResults result={analysis.result} />}
    </section>
  );
}
