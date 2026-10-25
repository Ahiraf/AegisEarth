import type { MouseEvent, ReactNode } from 'react';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { ScrollProgress } from './ScrollProgress';

export type NavId = 'explorer' | 'orbits' | 'atmosphere' | 'solar' | 'learn' | 'about';

type NavItem = { id: NavId; label: string; href: string; kind: 'page' | 'location' };

// "Orbits", "Atmosphere" and "Solar System" are sections of the Explorer page.
// They use real links (#/orbits ...) so Back, Forward and shared links all work.
const NAV: NavItem[] = [
  { id: 'explorer', label: 'Explorer', href: '#/', kind: 'page' },
  { id: 'orbits', label: 'Orbits', href: '#/orbits', kind: 'location' },
  { id: 'atmosphere', label: 'Atmosphere', href: '#/atmosphere', kind: 'location' },
  { id: 'solar', label: 'Solar System', href: '#/solar', kind: 'location' },
  { id: 'learn', label: 'Learn', href: '#/learn', kind: 'page' },
  { id: 'about', label: 'About & Sources', href: '#/about', kind: 'page' },
];

function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="3" />
      <g transform="rotate(-30 32 32)">
        <ellipse cx="32" cy="32" rx="21" ry="9" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="13.8" cy="36.5" r="4.5" fill="currentColor" />
        <circle className="logo-hollow" cx="50.2" cy="27.5" r="4.5" stroke="currentColor" strokeWidth="3" />
      </g>
    </svg>
  );
}

type LayoutProps = {
  current: NavId;
  children: ReactNode;
};

export function Layout({ current, children }: LayoutProps) {
  const skipToMain = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById('main')?.focus();
  };

  // Clicking the logo while already on the Explorer has no hash change, so scroll up by hand.
  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    const hash = window.location.hash;
    if (hash === '' || hash === '#/') {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  };

  return (
    <>
      <a className="skip-link" href="#main" onClick={skipToMain}>
        Skip to main content
      </a>
      <ScrollProgress />

      <header className="hdr">
        <div className="wrap">
          <a className="brand" href="#/" aria-label="AegisEarth home" onClick={goHome}>
            <LogoMark />
            <span>
              Aegis<b>Earth</b>
            </span>
          </a>
          <nav aria-label="Main">
            <ul className="nav-list">
              {NAV.map((item) => (
                <li key={item.id}>
                  <a
                    className="nav-link"
                    href={item.href}
                    aria-current={current === item.id ? (item.kind === 'page' ? 'page' : 'location') : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div>
            <p className="footer-brand">AegisEarth</p>
            <p className="footer-statement">
              AegisEarth is an independent student project by Team Infraq Stargazers. It is not affiliated with or
              endorsed by NASA.
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="footer-links">
              <li><a href="#/">Explorer</a></li>
              <li><a href="#/learn">Learn</a></li>
              <li><a href="#/about">About &amp; Sources</a></li>
              <li>
                <a href="https://github.com/Ahiraf/AegisEarth" target="_blank" rel="noreferrer">
                  GitHub repository<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
