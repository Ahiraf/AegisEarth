import type { ReactNode } from 'react';

type BadgeVariant = 'source' | 'demo' | 'snapshot' | 'status';

type BadgeProps = {
  variant: BadgeVariant;
  children: ReactNode;
  href?: string;
};

const ICONS: Record<BadgeVariant, string> = {
  source: 'i',
  demo: '!',
  snapshot: 'S',
  status: 'i',
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