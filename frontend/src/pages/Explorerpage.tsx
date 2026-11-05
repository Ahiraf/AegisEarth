import { useState } from "react";
import { LiveExplorer } from "../features/sky/LiveExplorer";
import { getDataMode } from "../services/config";
import { SavedExplorerPage } from "./SavedExplorerpage";

export function ExplorerPage() {
  const [mode, setMode] = useState(() =>
    new URLSearchParams(location.search).get("source") === "snapshot"
      ? "snapshot"
      : getDataMode(),
  );
  if (mode === "snapshot")
    return (
      <>
        <div className="wrap sky-archive-switch">
          <span className="chip chip-info">SAVED ARCHIVE RECORDS</span>
          <button className="btn btn-s btn-sm" onClick={() => setMode("api")}>
            Open live sky viewer
          </button>
        </div>
        <SavedExplorerPage />
      </>
    );
  return <LiveExplorer onArchive={() => setMode("snapshot")} />;
}
