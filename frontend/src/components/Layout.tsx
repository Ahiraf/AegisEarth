import type { MouseEvent, ReactNode } from 'react';
import { dataSourceMode } from '../services/config';

export type PageId = 'explorer' | 'learn' | 'about';

const NAV: { id: PageId; label: string; href: string }[] = [
  { id: 'explorer', label: 'Explorer', href: '#/' },
  { id: 'learn', label: 'Learn', href: '#/learn' },
  { id: 'about', label: 'About & Sources', href: '#/about' },
];

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="32" cy="32" r="5" fill="currentColor" />
      <g transform="rotate(-30 32 32)">
        <ellipse cx="32" cy="32" rx="20" ry="9" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="14.68" cy="36.5" r="4.5" fill="currentColor" />
        <circle className="logo-hollow" cx="49.32" cy="27.5" r="4.5" stroke="currentColor" strokeWidth="3" />
      </g>
    </svg>
  );
}

type LayoutProps = {
  current: PageId;
  children: ReactNode;
};

export function Layout({ current, children }: LayoutProps) {
  const skipToMain = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById('main')?.focus();
  };

  return (
    <>
      <a className="skip-link" href="#main" onClick={skipToMain}>
        Skip to main content
      </a>

      {dataSourceMode === 'demo' ? (
        <div className="demo-banner" role="status">
          <strong>DEMO DATA</strong> — synthetic interface examples only. Nothing here is a SPHEREx or NASA finding.
        </div>
      ) : null}

      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#/" aria-label="AegisEarth home">
            <LogoMark />
            <span>
              <span className="brand-a">Aegis</span>
              <span className="brand-e">Earth</span>
            </span>
          </a>
          <nav aria-label="Main">
            <ul className="nav-list">
              {NAV.map((item) => (
                <li key={item.id}>
                  <a
                    className="nav-link"
                    href={item.href}
                    aria-current={current === item.id ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="container page" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>
            AegisEarth is an independent student project by Team Infraq Stargazers. It is not
            affiliated with or endorsed by NASA.
          </p>
        </div>
      </footer>
    </>
  );
}
