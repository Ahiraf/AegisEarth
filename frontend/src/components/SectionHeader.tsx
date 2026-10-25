import type { ReactNode } from 'react';

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  lead?: string;
  chip?: ReactNode;
  headingId?: string;
};

export function SectionHeader({ eyebrow, title, lead, chip, headingId }: SectionHeaderProps) {
  return (
    <div className="sh">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={headingId} tabIndex={-1}>{title}</h2>
        {lead ? <p className="lead2">{lead}</p> : null}
      </div>
      {chip}
    </div>
  );
}
