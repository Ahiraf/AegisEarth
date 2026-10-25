import type { ReactNode } from 'react';

type ValueProps = {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  /** Optional link around the value (for example a source record). */
  href?: string | null;
};

/** Shows "Not available" for unknown values. 0 is a real value and is shown as 0. */
export function Unavailable() {
  return <span className="unavailable">Not available</span>;
}

// Use inside <dl className="value-list">.
export function Value({ label, value, unit, href }: ValueProps) {
  const missing = value === null || value === undefined || value === '';
  let content: ReactNode;
  if (missing) {
    content = <Unavailable />;
  } else {
    const text = `${value}${unit ? ` ${unit}` : ''}`;
    content = href ? (
      <a href={href} target="_blank" rel="noreferrer">
        {text}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      text
    );
  }
  return (
    <div className="value-row">
      <dt>{label}</dt>
      <dd>{content}</dd>
    </div>
  );
}
