import { SourceLink } from './SourceLink';

export type FactRowData = {
  label: string;
  value: string;
  source?: { name: string; url: string };
};

// A list of facts where each value can carry its own source link right beside it.
export function FactList({ rows, showSources = true }: { rows: FactRowData[]; showSources?: boolean }) {
  return (
    <dl className="fact-list">
      {rows.map((row) => (
        <div className="fact-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            <span>{row.value}</span>
            {showSources && row.source ? <SourceLink href={row.source.url} label={`${row.source.name} source`} context={row.label} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
