import { useCallback, useEffect, useRef, useState } from "react";
import { HeroSection } from "../../components/explorer/HeroSection";
import { ExplorerJourney } from "../../components/explorer/ExplorerJourney";
import "../../styles/explorer-workspace.css";
import { MetadataRanker } from "./MetadataRanker";
import { NextLinks } from "../../components/explorer/NextLinks";
import { useCardGlow } from "../../hooks/useCardGlow";
import { prefersReducedMotion } from "../../hooks/useReducedMotion";
import { scrollToId } from "../../lib/scroll";
import { AladinPanel } from "./AladinPanel";
import {
  apiUrl,
  cancel,
  discoveryRequest,
  errorMessage,
  get,
  post,
  references,
  submit,
} from "./api";
import { DiscoveryResults } from "./DiscoveryResults";
import { MoviePlayer, type SkyPosition } from "./MoviePlayer";
import { ProcessingTools } from "./ProcessingTools";
import { DEFAULT_REQUEST, SearchForm } from "./SearchForm";
import { ArchivedTargetPreviews } from "./ArchivedTargetPreviews";
import { frontendLink, SharePanel } from "./SharePanel";
import type {
  Acceptance,
  CanonicalViewRequest,
  Discovery,
  Links,
  References,
  TimelineMode,
  ViewRequest,
  Frame,
} from "./types";
import { useSkyView } from "./useSkyView";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function initialId(query: URLSearchParams) {
  const value = query.get("view");
  return value && UUID.test(value) ? value : null;
}
function editableRequest(canonical: CanonicalViewRequest): ViewRequest {
  const { region } = canonical;
  return {
    contract_version: "view-v2",
    region: {
      ra: region.ra_deg,
      dec: region.dec_deg,
      width_arcmin: region.width_arcmin,
      height_arcmin: region.height_arcmin,
    },
    collections: canonical.collections,
    max_frames: canonical.max_frames,
    preparation: canonical.preparation,
    start_at: canonical.start_at,
    end_at: canonical.end_at,
    detectors: canonical.detectors,
    wavelength_min_um: canonical.wavelength_min_um,
    wavelength_max_um: canonical.wavelength_max_um,
  };
}
interface Submission {
  path: string;
  body: unknown;
  key: string;
  refresh: boolean;
}
export function LiveExplorer({ onArchive }: { onArchive: () => void }) {
  useCardGlow();
  const [initialQuery] = useState(() => new URLSearchParams(location.search));
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [form, setForm] = useState<ViewRequest>(DEFAULT_REQUEST);
  const [reference, setReference] = useState<References>();
  const [referenceRetry, setReferenceRetry] = useState(0);
  const [id, setId] = useState<string | null>(() => initialId(initialQuery));
  const [openId, setOpenId] = useState("");
  const [openIdError, setOpenIdError] = useState("");
  const [mode, setMode] = useState<TimelineMode>(
    initialQuery.get("mode") === "native" ? "native" : "common",
  );
  const [reload, setReload] = useState(0);
  const [submission, setSubmission] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [receipt, setReceipt] = useState<Acceptance | null>(null);
  const [links, setLinks] = useState<Links | null>(null);
  const [position, setPosition] = useState<SkyPosition | null>(null);
  const [activeFrame, setActiveFrame] = useState<Frame | undefined>();
  const [restore, setRestore] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [recordHistory, setRecordHistory] = useState<Discovery[]>([]);
  const [pendingRecordPage, setPendingRecordPage] = useState<string | null>(
    null,
  );
  const [discovering, setDiscovering] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const [discoveryError, setDiscoveryError] = useState("");
  const requestController = useRef<AbortController | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const shareController = useRef<AbortController | null>(null);
  const lastSubmission = useRef<Submission | null>(null);
  const lastDiscovery = useRef<ViewRequest | null>(null);
  const view = useSkyView(id, mode, reload);
  useEffect(() => {
    if (submission) scrollToId("movie-progress", true);
  }, [submission]);
  useEffect(
    () => () => {
      requestController.current?.abort();
      searchController.current?.abort();
      shareController.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    void references(controller.signal).then((value) => {
      if (!controller.signal.aborted) setReference(value);
    });
    return () => controller.abort();
  }, [referenceRetry]);
  useEffect(() => {
    const controller = new AbortController();
    if (initialQuery.get("v")) {
      const query = new URLSearchParams(initialQuery);
      query.delete("source");
      query.delete("mode_override");
      void get<{ state: Links["state"] }>(
        `/api/v1/share/resolve?${query}`,
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) return;
          setForm(result.state.request);
          setMode(result.state.mode);
          setRestore(
            "Shared coordinates and options restored. Prepare a sky movie when you are ready; no job has been submitted.",
          );
        })
        .catch((error) => {
          if (!controller.signal.aborted) setRestore(errorMessage(error));
        });
    } else if (initialQuery.get("view") && !initialId(initialQuery))
      setRestore(
        "The saved view ID is invalid. Enter a valid ID or search coordinates.",
      );
    return () => controller.abort();
  }, [initialQuery]);
  useEffect(() => {
    if (view.manifest) setForm(editableRequest(view.manifest.request));
  }, [view.manifest]);
  const failedRequest = view.job?.canonical_request;
  const terminal =
    view.job?.status === "failed" || view.job?.status === "canceled";
  function editFailedRequest(request: CanonicalViewRequest) {
    setForm(editableRequest(request));
    setLinks(null);
    document.getElementById("search-ra")?.focus();
  }
  const runSubmission = useCallback(
    async (pending: Submission) => {
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      lastSubmission.current = pending;
      setSubmission(true);
      setSubmissionError("");
      try {
        const accepted = await submit(
          pending.path,
          pending.body,
          pending.key,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setReceipt(accepted);
        setId(accepted.id);
        setReload((n) => n + 1);
        setPosition(null);
        setLinks(null);
        setRestore(
          pending.refresh
            ? "Latest-data check submitted. The original saved view is preserved."
            : "",
        );
        history.replaceState(
          null,
          "",
          frontendLink(`view=${accepted.id}&mode=${mode}`),
        );
      } catch (error) {
        if (!controller.signal.aborted) setSubmissionError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) setSubmission(false);
      }
    },
    [mode],
  );
  function prepare(value: ViewRequest) {
    void runSubmission({
      path: "/api/v1/views",
      body: structuredClone(value),
      key: crypto.randomUUID(),
      refresh: false,
    });
  }
  function refresh() {
    if (id)
      void runSubmission({
        path: `/api/v1/views/${id}/refresh`,
        body: {},
        key: crypto.randomUUID(),
        refresh: true,
      });
  }
  async function discover(value: ViewRequest) {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    lastDiscovery.current = structuredClone(value);
    setDiscovering(true);
    setDiscoveryError("");
    setDiscovery(null);
    setRecordHistory([]);
    setPendingRecordPage(null);
    try {
      const result = await post<Discovery>(
        "/api/v1/observations/search",
        discoveryRequest(value),
        controller.signal,
      );
      if (!controller.signal.aborted) setDiscovery(result);
    } catch (error) {
      if (!controller.signal.aborted) setDiscoveryError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setDiscovering(false);
    }
  }
  async function share(value: ViewRequest) {
    if (sharing) return;
    shareController.current?.abort();
    const controller = new AbortController();
    shareController.current = controller;
    setSharing(true);
    setShareError("");
    setLinks(null);
    try {
      const created = await post<Links>(
        "/api/v1/share/links",
        { version: "share-v1", request: value, mode },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setLinks(created);
      window.requestAnimationFrame(() => {
        if (!controller.signal.aborted) scrollToId("share", true);
      });
    } catch (error) {
      if (!controller.signal.aborted) setShareError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setSharing(false);
    }
  }
  async function nextRecords(path: string) {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const currentPage = discovery;
    setDiscovering(true);
    setDiscoveryError("");
    setPendingRecordPage(path);
    try {
      const next = await get<Discovery>(path, controller.signal);
      if (controller.signal.aborted) return;
      if (currentPage) setRecordHistory((history) => [...history, currentPage]);
      setDiscovery(next);
      setPendingRecordPage(null);
    } catch (error) {
      if (!controller.signal.aborted) setDiscoveryError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setDiscovering(false);
    }
  }
  function previousRecords() {
    if (!recordHistory.length || discovering) return;
    setDiscovery(recordHistory[recordHistory.length - 1]);
    setRecordHistory((history) => history.slice(0, -1));
    setPendingRecordPage(null);
    setDiscoveryError("");
  }
  async function stop() {
    if (!receipt?.cancel_token) return;
    try {
      await cancel(receipt.id, receipt.cancel_token);
      setReload((n) => n + 1);
    } catch (error) {
      setSubmissionError(errorMessage(error));
    }
  }
  function open() {
    if (!UUID.test(openId.trim())) {
      setOpenIdError("Enter a valid saved view UUID.");
      return;
    }
    setOpenIdError("");
    requestController.current?.abort();
    setSubmission(false);
    setSubmissionError("");
    setReceipt(null);
    setLinks(null);
    setPosition(null);
    setId(openId.trim());
    setReload((n) => n + 1);
    history.replaceState(
      null,
      "",
      frontendLink(`view=${openId.trim()}&mode=${mode}`),
    );
  }
  const center = {
    ra_deg: view.manifest?.request.region.ra_deg || 0,
    dec_deg: view.manifest?.request.region.dec_deg || 0,
  };
  let progressMessage = "";
  if (submission)
    progressMessage = "Finding observations and submitting your request…";
  else if (view.loading) {
    if (view.manifest) progressMessage = "Loading movie frames…";
    else if (view.job?.status === "queued")
      progressMessage = "Waiting for image processing to start…";
    else if (view.job?.status === "running")
      progressMessage = "Preparing sky images…";
    else progressMessage = "Checking the movie request…";
  } else if (view.frames.length && !view.error) {
    progressMessage = "Your sky movie frames are ready below.";
  }
  return (
    <div className={paused ? "motion-paused" : undefined}>
      <HeroSection
        paused={paused}
        onTogglePaused={() => setPaused((p) => !p)}
      />
      <div className="wrap sky-workspace">
        <ExplorerJourney
          hasObservations={Boolean(discovery) && !discovering}
          hasMovie={Boolean(
            id && view.manifest && view.frames.length > 0 && !view.loading,
          )}
          onArchive={onArchive}
          onChoose={() => scrollToId("find", true)}
          onObservations={() => scrollToId("records-stage", true)}
          onMovie={() => scrollToId("movie-stage", true)}
        />
        {restore ? (
          <p className="sky-restored" role="status">
            {restore}
          </p>
        ) : null}
        <SearchForm
          value={form}
          onChange={(value) => {
            setForm(value);
            setLinks(null);
          }}
          references={reference}
          busy={submission}
          discovering={discovering}
          sharing={sharing}
          onPrepare={prepare}
          onDiscover={(value) => void discover(value)}
          onShare={(value) => void share(value)}
        />
        {shareError ? (
          <p className="state state-error" role="alert">
            Could not create a share link: {shareError}
          </p>
        ) : null}
        <div className="sky-saved-tools">
          <ArchivedTargetPreviews />
          <details className="sky-details sky-open-view">
            <summary>Open a saved view</summary>
            <form
              className="tb"
              onSubmit={(e) => {
                e.preventDefault();
                open();
              }}
            >
              <label className="field">
                Saved view ID
                <input
                  className="input mono"
                  value={openId}
                  onChange={(e) => {
                    setOpenId(e.target.value);
                    if (openIdError) setOpenIdError("");
                  }}
                  aria-invalid={Boolean(openIdError)}
                  aria-describedby={
                    openIdError ? "saved-view-id-error" : undefined
                  }
                  placeholder="View UUID"
                  autoComplete="off"
                />
              </label>
              <button className="btn btn-s" type="submit">
                Open saved view
              </button>
            </form>
            {openIdError ? (
              <p id="saved-view-id-error" className="field-error" role="alert">
                {openIdError}
              </p>
            ) : null}
          </details>
        </div>
        <section
          className="explorer-phase"
          id="records-stage"
          aria-label="02 / Review observations"
        >
          {!discovery && !discovering && !discoveryError ? (
            <div className="explorer-phase-empty">
              <span className="explorer-phase-number">
                02 / REVIEW OBSERVATIONS
              </span>
              <h2>Review observations</h2>
              <p>
                Search the archive from your chosen position above. Matching
                observations, times and wavelengths will appear here.
              </p>
              <button
                type="button"
                className="btn btn-s btn-sm"
                onClick={() => scrollToId("find", true)}
              >
                Choose a sky position ↗
              </button>
            </div>
          ) : null}
          <DiscoveryResults
            result={discovery}
            loading={discovering}
            error={discoveryError}
            onNext={(path) => void nextRecords(path)}
            hasPrevious={recordHistory.length > 0}
            onPrevious={previousRecords}
            onRetry={() => {
              if (pendingRecordPage) void nextRecords(pendingRecordPage);
              else if (lastDiscovery.current)
                void discover(lastDiscovery.current);
            }}
          />
        </section>
        <section
          className="explorer-phase"
          id="movie-stage"
          aria-label="03 / Play a sky movie"
        >
          {!(id && view.manifest) ? (
            <div className="explorer-phase-heading">
              <span className="explorer-phase-number">
                03 / PLAY A SKY MOVIE
              </span>
              <h2>Play a sky movie</h2>
              <p>
                The movie player displays actual archived images once they are
                prepared. You can start directly from your chosen sky position.
              </p>
              <button
                type="button"
                className="btn btn-s btn-sm"
                onClick={() => scrollToId("find", true)}
              >
                Choose a field and prepare images ↗
              </button>
            </div>
          ) : null}
          {id || submission || submissionError ? (
            <section
              id="movie-progress"
              className="sky-view-status card"
              aria-labelledby="movie-progress-title"
              tabIndex={-1}
            >
              <div className="sh">
                <div>
                  <h2 id="movie-progress-title" className="eyebrow">
                    Sky movie progress
                  </h2>
                  {id && !submission ? (
                    <p className="mono sky-break" data-testid="view-id">
                      {id}
                    </p>
                  ) : null}
                </div>
                <span className="chip chip-info">
                  {submission
                    ? "submitting"
                    : submissionError
                      ? "request error"
                      : view.job?.status ||
                        (view.loading ? "loading" : "saved view")}
                </span>
              </div>
              {progressMessage ? (
                <div role="status">{progressMessage}</div>
              ) : null}
              {submissionError ? (
                <div className="state state-error">
                  <p role="alert">{submissionError}</p>
                  {lastSubmission.current ? (
                    <button
                      className="btn btn-s btn-sm"
                      onClick={() =>
                        void runSubmission(lastSubmission.current!)
                      }
                    >
                      Retry submission
                    </button>
                  ) : null}
                </div>
              ) : null}
              {view.error && !submission ? (
                <p className="field-error" role="alert">
                  {view.error}
                </p>
              ) : null}
              {id && !submission ? (
                <div className="tb">
                  {view.error &&
                  terminal &&
                  failedRequest?.contract_version === "view-v2" ? (
                    <button
                      className="btn btn-s btn-sm"
                      onClick={() => editFailedRequest(failedRequest)}
                    >
                      Edit request and retry
                    </button>
                  ) : null}
                  {view.error && !terminal ? (
                    <button
                      className="btn btn-s btn-sm"
                      onClick={() => setReload((n) => n + 1)}
                    >
                      Reload saved view
                    </button>
                  ) : null}
                  {view.loading &&
                  receipt?.id === id &&
                  receipt.cancel_token ? (
                    <button
                      className="btn btn-s btn-sm"
                      onClick={() => void stop()}
                    >
                      Cancel view processing
                    </button>
                  ) : null}
                  <a
                    className="srclink"
                    href={apiUrl(`/api/v1/views/${id}`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Status and source request ↗
                  </a>
                </div>
              ) : null}
              {!submission &&
                view.detailErrors.map((e) => (
                  <p className="note" key={e}>
                    Supporting source detail: {e}
                  </p>
                ))}
            </section>
          ) : null}
          {id && view.manifest ? (
            <>
              <div
                className="explorer-prepared-overview"
                aria-label="Prepared movie summary"
              >
                <div>
                  <span className="explorer-mini-kicker">
                    YOUR PREPARED SKY VIEW
                  </span>
                  <h3>Real observations, ready to explore.</h3>
                  <p>
                    Navigate through the available frames and inspect the source
                    data. Display playback does not represent physical elapsed
                    time.
                  </p>
                </div>
                <div className="explorer-prepared-metrics">
                  <div>
                    <strong>{view.manifest.timelines[mode].frame_count}</strong>
                    <span>Frames in this timeline</span>
                  </div>
                  <div>
                    <strong>
                      {view.manifest.timelines[mode].distinct_epoch_count}
                    </strong>
                    <span>Observing epochs</span>
                  </div>
                  <div>
                    <strong>
                      {mode === "common" ? "Sky-fixed" : "Native"}
                    </strong>
                    <span>Inspection mode</span>
                  </div>
                </div>
              </div>
              <MoviePlayer
                key={`${id}:${mode}`}
                id={id}
                manifest={view.manifest}
                frames={view.frames}
                loading={view.loading}
                mode={mode}
                onMode={setMode}
                position={position}
                onPosition={setPosition}
                onFrame={setActiveFrame}
              />
              <div className="explorer-evidence-intro" id="evidence-stage">
                <div>
                  <p className="explorer-mini-kicker">
                    PREPARED IMAGE EVIDENCE
                  </p>
                  <h2>Go deeper than the moving image.</h2>
                  <p>
                    Inspect the current sky frame, check processing eligibility,
                    or examine derived image and spectral products. Tools only
                    use observations available in this prepared view.
                  </p>
                </div>
                <button
                  className="btn btn-s btn-sm"
                  type="button"
                  onClick={() => scrollToId("processing", true)}
                >
                  Explore scientific tools ↗
                </button>
              </div>
              <AladinPanel
                key={id}
                manifest={view.manifest}
                frame={
                  view.frames.find((frame) => frame.id === activeFrame?.id) ||
                  view.frames[0]
                }
              />
              <ProcessingTools
                key={id}
                id={id}
                preparation={view.preparation}
                options={view.options}
                position={position}
                center={center}
                onPosition={setPosition}
              />
            </>
          ) : null}
          {id || links ? (
            <SharePanel
              id={id}
              mode={mode}
              manifest={view.manifest}
              request={form}
              links={links}
              setLinks={setLinks}
              onRefresh={refresh}
              refreshing={submission || view.loading}
              expires={view.job?.expires_at_utc}
            />
          ) : null}
        </section>
        <details className="sky-details sky-provenance-meta">
          <summary>Data releases, source registry and metadata checks</summary>
          {reference?.errors.length ? (
            <div className="explorer-reference-diagnostics">
              <p>
                Some optional archive reference information could not be loaded.
                You can still try a search; individual requests report their own
                errors.
              </p>
              <ul className="note">
                {reference.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-s btn-sm"
                onClick={() => setReferenceRetry((count) => count + 1)}
              >
                Retry reference information
              </button>
            </div>
          ) : null}
          {reference?.registry ? (
            <p className="note">Source registry: {reference.registry}</p>
          ) : null}
          <p className="note">
            The archive can lag ingestion and return capped samples. A refreshed
            metadata query is not scientific calibration approval.
          </p>
          <ul className="note">
            {reference?.releases.map((r, i) => (
              <li key={i}>
                {String(r.collection)} · {String(r.release)} ·{" "}
                {String(r.psf_format || "")} · {String(r.doi || "")}
              </li>
            ))}
          </ul>
          {reference?.refreshChecks?.length ? (
            <pre className="sky-json">
              {JSON.stringify(reference.refreshChecks, null, 2)}
            </pre>
          ) : null}
        </details>
        <div className="explorer-ranker-wrap" id="ai-stage">
          <div className="explorer-ranker-intro">
            <p className="explorer-mini-kicker">
              05 / OPTIONAL MOTION EVIDENCE
            </p>
            <h2>See what the known-object ranker can tell you.</h2>
            <p>
              An optional analysis of predicted known moving objects—not
              asteroid discovery or impact prediction. The movie works even when
              ranking is unavailable.
            </p>
          </div>
          <MetadataRanker
            snapshotId={discovery?.snapshot_id}
            enabled={reference?.capabilities.metadata_ranker_available === true}
          />
        </div>
        <NextLinks />
      </div>
    </div>
  );
}
