import { useState, type ChangeEvent } from "react";
import { compareFacts } from "../../lib/compare";
import {
  describeObservation,
  formatWavelengthRange,
  observationName,
  originLabel,
} from "../../lib/format";
import { FIT_VIEW, type ViewState } from "../../lib/viewState";
import type { DataMode, Observation } from "../../types/observation";
import type { Selection, Slot } from "../../types/ui";
import { BandChart } from "../BandChart";
import { ImageViewer } from "../ImageViewer";
import { ModeChip } from "../ModeChip";
import { Notice } from "../Notice";
import { Reveal } from "../Reveal";
import { SectionHeader } from "../SectionHeader";
import { SourceLink } from "../SourceLink";
import { Value } from "../Value";

type CompareSectionProps = {
  mode: DataMode;
  observations: Observation[];
  selection: Selection;
  onSwap: () => void;
  onClear: () => void;
};

type PanelProps = {
  label: string;
  observation: Observation | null;
  view: ViewState;
  onViewChange: (next: ViewState) => void;
};

function ComparisonPanel({
  label,
  observation,
  view,
  onViewChange,
}: PanelProps) {
  const preview = observation?.preview ?? null;
  const range = observation ? formatWavelengthRange(observation) : null;
  return (
    <article className="panel" aria-label={label}>
      <p className="eyebrow">{label}</p>
      <h3 className="mono">
        {observation ? observationName(observation) : "No record selected"}
      </h3>
      {observation && preview ? (
        <ImageViewer
          label={label}
          caption={observation.display.rendering ?? "Observation preview"}
          view={view}
          onViewChange={onViewChange}
        >
          <img
            className="viewer-img"
            src={preview.url}
            alt={preview.alt}
            draggable={false}
          />
        </ImageViewer>
      ) : observation ? (
        <div className="product-card">
          <BandChart band={observation.detector} />
          <p className="product-note">
            The archive stores this image as a FITS file, which browsers cannot
            display directly. Open the product to view it with astronomy
            software or IRSA&rsquo;s tools.
          </p>
        </div>
      ) : (
        <div className="empty">Select a record in the table above</div>
      )}
      {observation && observation.provenance.sourceRecordUrl && (
        <p className="product-note">
          <SourceLink
            href={observation.provenance.sourceRecordUrl}
            label="Original FITS product in IRSA"
            context={observationName(observation)}
          />
        </p>
      )}
      {observation ? (
        <p className="sr-only">{describeObservation(observation)}</p>
      ) : null}
      <dl className="value-list">
        <Value
          label="Observation ID"
          value={observation ? observationName(observation) : null}
        />
        <Value
          label="Planning period"
          value={observation?.planningPeriod ?? null}
        />
        <Value
          label="Band"
          value={
            observation?.bandLabel
              ? `${observation.bandLabel}${range ? `, ${range}` : ""}`
              : null
          }
        />
        <Value label="Processed" value={observation?.processedOn ?? null} />
        <Value
          label="Source"
          value={observation ? originLabel(observation.origin) : null}
        />
      </dl>
    </article>
  );
}

export function CompareSection({
  mode,
  observations,
  selection,
  onSwap,
  onClear,
}: CompareSectionProps) {
  const [viewA, setViewA] = useState<ViewState>(FIT_VIEW);
  const [viewB, setViewB] = useState<ViewState>(FIT_VIEW);
  const [linked, setLinked] = useState(true);

  const find = (id: string | null) =>
    observations.find((o) => o.id === id) ?? null;
  const a = find(selection.a);
  const b = find(selection.b);
  const hasPreview = Boolean(a?.preview || b?.preview);

  const changeView = (slot: Slot, next: ViewState) => {
    if (linked) {
      setViewA(next);
      setViewB(next);
    } else if (slot === "a") setViewA(next);
    else setViewB(next);
  };
  const toggleLinked = (value: boolean) => {
    setLinked(value);
    if (value) setViewB(viewA);
  };

  const facts = a && b ? compareFacts(a, b) : [];

  return (
    <Reveal id="compare">
      <SectionHeader
        eyebrow="Side by side"
        title="Observation comparison"
        chip={<ModeChip mode={mode} />}
      />
      <div className="tb">
        <button
          className="btn btn-s"
          type="button"
          onClick={onSwap}
          disabled={!a && !b}
        >
          {"\u21c4"} Swap A / B
        </button>
        <button
          className="btn btn-s"
          type="button"
          onClick={onClear}
          disabled={!a && !b}
        >
          Clear selection
        </button>
        {hasPreview ? (
          <label className="check-line">
            <input
              type="checkbox"
              checked={linked}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                toggleLinked(event.target.checked)
              }
            />
            Link zoom and pan
          </label>
        ) : null}
      </div>

      <div className="cg">
        <ComparisonPanel
          label="Observation A"
          observation={a}
          view={viewA}
          onViewChange={(next) => changeView("a", next)}
        />
        <ComparisonPanel
          label="Observation B"
          observation={b}
          view={viewB}
          onViewChange={(next) => changeView("b", next)}
        />
      </div>

      <div className="interpretation">
        <Notice tone="info" title="Reading a comparison">
          <p>
            Differences between observations can reflect changes in the sky as
            well as wavelength, calibration, processing, or noise. The archived
            previews share a display stretch within each sky field. Masked or
            missing pixels are transparent.
          </p>
        </Notice>
      </div>

      {facts.length > 0 ? (
        <div
          className="facts"
          role="list"
          aria-label="How these two observations differ"
        >
          {facts.map((fact) => (
            <div
              className={`fact fact-${fact.tone}`}
              role="listitem"
              key={fact.label}
            >
              <p className="fact-label">{fact.label}</p>
              <p className="fact-verdict">
                <span className="fact-mark" aria-hidden="true">
                  {fact.tone === "same"
                    ? "="
                    : fact.tone === "different"
                      ? "\u2260"
                      : fact.tone === "info"
                        ? "i"
                        : "?"}
                </span>
                {fact.verdict}
              </p>
              <p className="fact-detail">{fact.detail}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Reveal>
  );
}
