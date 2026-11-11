import {
  formatTimestamp,
  formatWavelengthRange,
  observationName,
  originLabel,
} from "../../lib/format";
import type { Observation } from "../../types/observation";
import type { Selection } from "../../types/ui";
import { Reveal } from "../Reveal";
import { SectionHeader } from "../SectionHeader";
import { SourceLink } from "../SourceLink";
import { Value } from "../Value";

type ProvenanceSectionProps = {
  observations: Observation[];
  selection: Selection;
};

function DetailsPanel({
  label,
  observation,
}: {
  label: string;
  observation: Observation | null;
}) {
  const p = observation?.provenance;
  const d = observation?.display;
  const range = observation ? formatWavelengthRange(observation) : null;
  return (
    <article className="panel" aria-label={`${label} details`}>
      <p className="eyebrow">{label}</p>
      <h3 className="mono">
        {observation ? observationName(observation) : "No record selected"}
      </h3>
      <dl className="value-list">
        <Value
          label="Product"
          value={observation?.productId ?? null}
          href={p?.sourceRecordUrl ?? null}
        />
        <Value
          label="Observation ID"
          value={observation?.observationId ?? null}
        />
        <Value
          label="Planning period"
          value={observation?.planningPeriod ?? null}
        />
        <Value label="Detector" value={observation?.detector ?? null} />
        <Value
          label="Band"
          value={
            observation?.bandLabel
              ? `${observation.bandLabel}${range ? `, ${range}` : ""}`
              : null
          }
        />
        <Value
          label="Observation time"
          value={formatTimestamp(observation?.observedAt ?? null)}
        />
        <Value label="Processed" value={observation?.processedOn ?? null} />
        <Value label="Dataset" value={p?.dataset ?? null} />
        <Value
          label="Processing version"
          value={p?.processingRelease ?? null}
        />
        <Value label="Source" value={p?.sourceName ?? null} />
        <Value
          label="Saved on"
          value={formatTimestamp(p?.retrievedAt ?? null)}
        />
        {observation?.preview ? (
          <>
            <Value label="Image rendering" value={d?.rendering ?? null} />
            <Value label="Stretch" value={d?.stretch ?? null} />
            <Value label="Color mapping" value={d?.colorMap ?? null} />
          </>
        ) : null}
      </dl>
      {observation ? (
        <>
          <p className="srclinks-title">
            {originLabel(observation.origin)}. Verify it yourself:
          </p>
          <ul className="srclinks">
            {observation.provenance.links.map((link) => (
              <li key={link.url}>
                <SourceLink href={link.url} label={link.label} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

export function ProvenanceSection({
  observations,
  selection,
}: ProvenanceSectionProps) {
  const find = (id: string | null) =>
    observations.find((o) => o.id === id) ?? null;
  return (
    <Reveal id="prov">
      <SectionHeader
        eyebrow="Traceability"
        title="Observation details & provenance"
        lead="Each record links to the archive product and the documentation that defines its fields. Anything a source does not publish is marked Not available."
      />
      <div className="cg">
        <DetailsPanel label="Observation A" observation={find(selection.a)} />
        <DetailsPanel label="Observation B" observation={find(selection.b)} />
      </div>
    </Reveal>
  );
}
