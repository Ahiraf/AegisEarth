import { useEffect, useState } from "react";
import { LiveExplorer } from "../features/sky/LiveExplorer";
import { getDataMode } from "../services/config";
import { SavedExplorerPage } from "./SavedExplorerpage";


function sourceFromUrl(): "api" | "snapshot" {
  const source = new URLSearchParams(location.search).get("source");
  return source === "snapshot" || source === "api" ? source : getDataMode();
}

export function ExplorerPage() {
  const [mode, setMode] = useState(sourceFromUrl);
  // Make the selected explorer reproducible after refresh or when sharing a URL.
  function switchMode(next: "api" | "snapshot") {
    const url = new URL(window.location.href);
    url.searchParams.set("source", next);
    history.replaceState(null, "", url);
    setMode(next);
  }
  useEffect(() => {
    const restoreMode = () => setMode(sourceFromUrl());
    window.addEventListener("popstate", restoreMode);
    return () => window.removeEventListener("popstate", restoreMode);
  }, []);
  return (
    <>
      {mode === "snapshot" ? (
        <>
          <div className="wrap sky-archive-switch">
            <span className="chip chip-info">SAVED ARCHIVE RECORDS</span>
            <button
              className="btn btn-s btn-sm"
              onClick={() => switchMode("api")}
            >
              Open live sky viewer
            </button>
          </div>
          <SavedExplorerPage />
        </>
      ) : (
        <LiveExplorer
          onArchive={() => switchMode("snapshot")}
        />
      )}
    </>
  );
}
