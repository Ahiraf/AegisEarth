import type { ReactNode } from 'react';

type BadgeVariant = 'source' | 'demo' | 'snapshot' | 'status' | 'available' | 'developing' | 'off';

type BadgeProps = {
  variant: BadgeVariant;
  children: ReactNode;
  href?: string;
};

// Every badge has an icon AND words, so meaning never depends on colour alone.
const ICONS: Record<BadgeVariant, string> = {
  source: 'i',
  demo: '!',
  snapshot: 'S',
  status: 'i',
  available: '\u2713',
  developing: '\u2026',
  off: '\u2013',
};

export function Badge({ variant, children, href }: BadgeProps) {
  const content = (
    <>
      <span className="badge-icon" aria-hidden="true">{ICONS[variant]}</span>
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <a className={`badge badge-${variant}`} href={href} target="_blank" rel="noreferrer">
        {content}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <span className={`badge badge-${variant}`}>{content}</span>;
}
