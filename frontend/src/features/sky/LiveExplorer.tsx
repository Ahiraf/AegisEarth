import { useCallback, useEffect, useRef, useState } from "react";
import { HeroSection } from "../../components/explorer/HeroSection";
import { ModelSection } from "../../components/explorer/ModelSection";
import { OrbitsSection } from "../../components/explorer/OrbitsSection";
import { AtmosphereSection } from "../../components/explorer/AtmosphereSection";
import { SolarSection } from "../../components/explorer/SolarSection";
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
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState("");
  const requestController = useRef<AbortController | null>(null);
  const searchController = useRef<AbortController | null>(null);
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
    setSubmissionError("");
    try {
      const created = await post<Links>("/api/v1/share/links", {
        version: "share-v1",
        request: value,
        mode,
      });
      setLinks(created);
      document.getElementById("share")?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    } catch (error) {
      setSubmissionError(errorMessage(error));
    }
  }
  async function nextRecords(path: string) {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setDiscovering(true);
    setDiscoveryError("");
    try {
      const next = await get<Discovery>(path, controller.signal);
      if (!controller.signal.aborted) setDiscovery(next);
    } catch (error) {
      if (!controller.signal.aborted) setDiscoveryError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setDiscovering(false);
    }
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
      setSubmissionError("Enter a valid saved view UUID.");
      return;
    }
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
        <div className="sky-connection">
          <span className="chip chip-plain">
            {reference?.registry
              ? "API CONNECTED"
              : "CONNECTING TO DATA SERVICE"}
          </span>
          <span className="note">
            {reference?.registry
              ? `Source registry ${reference.registry}`
              : "Live requests use the configured API."}
          </span>
          <button
            className="srclink sky-text-button"
            onClick={() => setReferenceRetry((n) => n + 1)}
          >
            Recheck connection
          </button>
          <button className="srclink sky-text-button" onClick={onArchive}>
            Browse saved archive records
          </button>
        </div>
        {reference?.errors.length ? (
          <details className="sky-details">
            <summary>Some supporting data is unavailable</summary>
            <ul className="note">
              {reference.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        ) : null}
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
          onPrepare={prepare}
          onDiscover={(value) => void discover(value)}
          onShare={(value) => void share(value)}
        />
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
                onChange={(e) => setOpenId(e.target.value)}
                placeholder="View UUID"
                autoComplete="off"
              />
            </label>
            <button className="btn btn-s" type="submit">
              Open saved view
            </button>
          </form>
        </details>
        <DiscoveryResults
          result={discovery}
          loading={discovering}
          error={discoveryError}
          onNext={(path) => void nextRecords(path)}
          onRetry={() => {
            if (lastDiscovery.current) void discover(lastDiscovery.current);
          }}
        />
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
                  : view.job?.status ||
                    (submissionError ? "request error" : "loading")}
              </span>
            </div>
            <div role="status">{progressMessage}</div>
            {submissionError ? (
              <div className="state state-error">
                <p role="alert">{submissionError}</p>
                {lastSubmission.current ? (
                  <button
                    className="btn btn-s btn-sm"
                    onClick={() => void runSubmission(lastSubmission.current!)}
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
                {view.loading && receipt?.id === id && receipt.cancel_token ? (
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
        ) : !id ? (
          <div className="state">
            <p className="state-title">Ready to explore</p>
            <p>
              Prepare a sky movie or inspect observation records. The viewer
              works without an AI model.
            </p>
          </div>
        ) : null}
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
        <details className="sky-details">
          <summary>Data releases and last metadata checks</summary>
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
          <pre className="sky-json">
            {JSON.stringify(reference?.refreshChecks || [], null, 2)}
          </pre>
        </details>
        <ModelSection state={{ status: "not-connected" }} />
        <OrbitsSection paused={paused} />
        <AtmosphereSection />
        <SolarSection paused={paused} />
        <NextLinks />
      </div>
    </div>
  );
}
