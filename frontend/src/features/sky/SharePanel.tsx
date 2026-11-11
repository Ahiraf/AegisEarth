import { useEffect, useRef, useState } from "react";
import { Reveal } from "../../components/Reveal";
import { SectionHeader } from "../../components/SectionHeader";
import { apiUrl, errorMessage, get, post } from "./api";
import type { Links, Manifest, TimelineMode, ViewRequest } from "./types";

export function frontendLink(query: string) {
  const url = new URL(location.pathname, location.origin);
  url.search = query;
  // Live view links must remain live when the deployment defaults to saved data.
  url.searchParams.set("source", "api");
  url.hash = "/";
  return url.href;
}
interface Props {
  id: string | null;
  mode: TimelineMode;
  manifest?: Manifest;
  request: ViewRequest;
  links: Links | null;
  setLinks: (links: Links | null) => void;
  onRefresh: () => void;
  refreshing: boolean;
  expires?: string;
}
export function SharePanel({
  id,
  mode,
  manifest,
  request,
  links,
  setLinks,
  onRefresh,
  refreshing,
  expires,
}: Props) {
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    setBusy(false);
    setError("");
    setCopied("");
    return () => pending.current?.abort();
  }, [id, mode]);
  async function create(frozen: boolean) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError("");
    setCopied("");
    setBusy(true);
    try {
      const created =
        frozen && id
          ? await get<Links>(`/api/v1/views/${id}/links`, controller.signal)
          : await post<Links>(
              "/api/v1/share/links",
              {
                version: "share-v1",
                request,
                mode,
              },
              controller.signal,
            );
      if (!controller.signal.aborted) setLinks(created);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied("Copy is unavailable here; select the link text below.");
    }
  }
  const coordinate = links ? frontendLink(links.query) : "";
  const frozen = id ? frontendLink(`view=${id}&mode=${mode}`) : "";
  const embed = links?.embed_path
    ? `<iframe src="${apiUrl(links.embed_path + "?mode=" + mode)}" title="AegisEarth sky time viewer" width="760" height="1100" loading="lazy"></iframe>`
    : "";
  return (
    <Reveal id="share">
      <SectionHeader
        eyebrow="05 / Keep the evidence"
        title="Share, refresh and download"
      />
      <div className="card">
        <div className="tb">
          <button
            className="btn btn-s"
            disabled={busy}
            onClick={() => void create(false)}
          >
            Create coordinate link
          </button>
          <button
            className="btn btn-s"
            disabled={busy || !manifest}
            onClick={() => void create(true)}
          >
            Saved view links & embed
          </button>
          <button
            className="btn btn-p"
            disabled={!id || refreshing}
            onClick={onRefresh}
          >
            {refreshing ? "Refreshing…" : "Check latest data & rebuild"}
          </button>
        </div>
        <p className="note">
          Coordinate links restore settings for a new query. Saved view links
          keep the current manifest until its retention expires. Refresh creates
          a new view and preserves the previous one.
        </p>
        {expires ? (
          <p className="note">
            This view expires {new Date(expires).toLocaleString()}.
          </p>
        ) : null}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {links ? (
          <div className="sky-share-links">
            <label className="field">
              Coordinate link
              <input
                className="input mono"
                readOnly
                value={coordinate}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              className="btn btn-s btn-sm"
              onClick={() => void copy(coordinate, "Coordinate link copied.")}
            >
              Copy coordinate link
            </button>
            {manifest && frozen ? (
              <>
                <label className="field">
                  Saved view link
                  <input
                    className="input mono"
                    readOnly
                    value={frozen}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <button
                  className="btn btn-s btn-sm"
                  onClick={() => void copy(frozen, "Saved view link copied.")}
                >
                  Copy saved view link
                </button>
              </>
            ) : null}
            {embed ? (
              <>
                <label className="field">
                  Embed code
                  <textarea
                    className="input mono"
                    readOnly
                    rows={3}
                    value={embed}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <button
                  className="btn btn-s btn-sm"
                  onClick={() => void copy(embed, "Embed code copied.")}
                >
                  Copy embed code
                </button>
                <p className="note">
                  The host site must be allowed by the embedded viewer. Its
                  caption and credits remain visible.
                </p>
              </>
            ) : null}
            <p role="status" className="note">
              {copied}
            </p>
          </div>
        ) : null}
        {id && manifest ? (
          <div className="tb sky-downloads">
            <a
              className="btn btn-s btn-sm"
              href={apiUrl(`/api/v1/views/${id}/export-metadata?format=json`)}
            >
              Download metadata JSON
            </a>
            <a
              className="btn btn-s btn-sm"
              href={apiUrl(`/api/v1/views/${id}/export-metadata?format=csv`)}
            >
              Download metadata CSV
            </a>
            <a
              className="srclink"
              href={apiUrl(`/api/v1/views/${id}/manifest`)}
              target="_blank"
              rel="noreferrer"
            >
              Frozen manifest ↗
            </a>
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}
