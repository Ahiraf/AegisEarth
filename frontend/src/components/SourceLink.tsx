type SourceLinkProps = {
  href: string;
  /** Visible text, for example "NASA source". */
  label: string;
  /** What the link supports, used to give screen readers a meaningful name. */
  context?: string;
};

// One consistent treatment for every external source link: short text, an external-link icon,
// a visible focus state, and a safe new-tab link.
export function SourceLink({ href, label, context }: SourceLinkProps) {
  return (
    <a
      className="srclink"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={context ? `${label} for ${context} (opens in a new tab)` : `${label} (opens in a new tab)`}
    >
      <span>{label}</span>
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
        <path d="M9 2h5v5M14 2 7.5 8.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
