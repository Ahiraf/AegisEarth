import { useCallback, useEffect, useRef, useState } from "react";
import { AtmosphereSection } from "../components/explorer/AtmosphereSection";
import { CompareSection } from "../components/explorer/CompareSection";
import { HeroSection } from "../components/explorer/HeroSection";
import { ModelSection } from "../components/explorer/ModelSection";
import { NextLinks } from "../components/explorer/NextLinks";
import { OrbitsSection } from "../components/explorer/OrbitsSection";
import { ProvenanceSection } from "../components/explorer/ProvenanceSection";
import { ResultsSection } from "../components/explorer/ResultsSection";
import { SearchSection } from "../components/explorer/SearchSection";
import { SolarSection } from "../components/explorer/SolarSection";
import { prefersReducedMotion } from "../hooks/useReducedMotion";
import { useCardGlow } from "../hooks/useCardGlow";
import { M101 } from "../data/irsaSnapshot";
import { validateSearch, type SearchFormValues } from "../lib/validation";
import { snapshotProvider as provider } from "../services/snapshotProvider";
import type { SearchParams } from "../services/provider";
import type { MlPanelState } from "../types/ml";
import type { SearchUi, Selection, Slot } from "../types/ui";

// Starting values: the Pinwheel Galaxy (M101) and the full date range of the saved records.
const DEFAULT_VALUES: SearchFormValues = {
  ra: String(M101.raDeg),
  dec: String(M101.decDeg),
  startDate: "2025-01-01",
  endDate: "2026-12-31",
};
const NO_SELECTION: Selection = { a: null, b: null };
const ML_STATE: MlPanelState = { status: "not-connected" };

export function SavedExplorerPage() {
  const mode = "snapshot" as const;
  useCardGlow();

  const [paused, setPaused] = useState(prefersReducedMotion);
  const [values, setValues] = useState<SearchFormValues>(DEFAULT_VALUES);
  const [ui, setUi] = useState<SearchUi>({ phase: "idle" });
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);

  const controller = useRef<AbortController | null>(null);
  const lastParams = useRef<SearchParams | null>(null);
  // Cancel any search still running when the page is left.
  useEffect(() => () => controller.current?.abort(), []);

  const runSearch = useCallback(
    async (params: SearchParams) => {
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      lastParams.current = params;
      setUi({ phase: "loading" });
      setSelection(NO_SELECTION);
      try {
        const result = await provider.search(params, request.signal);
        if (request.signal.aborted) return;
        setUi({ phase: "done", result });
        // Show the earliest and the latest planning period side by side straight away.
        if (result.status === "ok" && result.observations.length >= 2) {
          const list = result.observations;
          setSelection({ a: list[0].id, b: list[list.length - 1].id });
        }
      } catch {
        if (request.signal.aborted) return;
        setUi({
          phase: "done",
          result: {
            status: "error",
            message:
              "The data service did not respond. Check your connection and try again.",
          },
        });
      }
    },
    [mode],
  );

  const retry = () => {
    if (lastParams.current) void runSearch(lastParams.current);
  };

  // Fills the form with the Pinwheel Galaxy example and searches straight away.
  const useExample = () => {
    const next = {
      ...values,
      ra: String(M101.raDeg),
      dec: String(M101.decDeg),
    };
    setValues(next);
    const { params } = validateSearch(next);
    if (params) void runSearch(params);
  };

  // Choosing a record for one slot that is already in the other slot swaps them.
  const assign = (slot: Slot, id: string) =>
    setSelection((prev) => {
      const other: Slot = slot === "a" ? "b" : "a";
      if (prev[other] === id)
        return { ...prev, [slot]: id, [other]: prev[slot] } as Selection;
      return { ...prev, [slot]: id };
    });

  const observations =
    ui.phase === "done" && ui.result.status === "ok"
      ? ui.result.observations
      : [];

  return (
    <div className={paused ? "motion-paused" : undefined}>
      <HeroSection
        paused={paused}
        onTogglePaused={() => setPaused((p) => !p)}
      />
      <div className="wrap">
        <SearchSection
          values={values}
          onValuesChange={setValues}
          onSearch={(params) => void runSearch(params)}
          busy={ui.phase === "loading"}
          mode={mode}
        />
        <ResultsSection
          ui={ui}
          mode={mode}
          selection={selection}
          onAssign={assign}
          onRetry={retry}
          onUseExample={useExample}
        />
        <CompareSection
          mode={mode}
          observations={observations}
          selection={selection}
          onSwap={() => setSelection((prev) => ({ a: prev.b, b: prev.a }))}
          onClear={() => setSelection(NO_SELECTION)}
        />
        <ProvenanceSection observations={observations} selection={selection} />
        <ModelSection state={ML_STATE} />
        <OrbitsSection paused={paused} />
        <AtmosphereSection />
        <SolarSection paused={paused} />
        <NextLinks />
      </div>
    </div>
  );
}
