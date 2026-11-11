import type { MouseEvent, ReactNode } from "react";
import { prefersReducedMotion } from "../hooks/useReducedMotion";
import { ScrollProgress } from "./ScrollProgress";
import "../styles/brand-polish.css";

export type NavId =
  | "explorer"
  | "orbits"
  | "atmosphere"
  | "solar"
  | "learn"
  | "about";

type NavItem = { id: NavId; label: string; href: string };

// Each hash URL mounts its own page; Back, Forward and shared links work.
const NAV: NavItem[] = [
  { id: "explorer", label: "Explorer", href: "#/" },
  { id: "orbits", label: "Orbits", href: "#/orbits" },
  { id: "atmosphere", label: "Atmosphere", href: "#/atmosphere" },
  { id: "solar", label: "Solar System", href: "#/solar" },
  { id: "learn", label: "Learn", href: "#/learn" },
  { id: "about", label: "About & Sources", href: "#/about" },
];

type LayoutProps = {
  current: NavId;
  children: ReactNode;
};

export function Layout({ current, children }: LayoutProps) {
  const immersive = ["orbits", "atmosphere", "solar"].includes(current);
  const skipToMain = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("main")?.focus();
  };

  // Clicking the logo while already on the Explorer has no hash change, so scroll up by hand.
  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    const hash = window.location.hash;
    if (hash === "" || hash === "#/") {
      event.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  };

  return (
    <div className={immersive ? "app-shell app-shell-immersive" : "app-shell"}>
      <a className="skip-link" href="#main" onClick={skipToMain}>
        Skip to main content
      </a>
      {!immersive && <ScrollProgress />}

      <header className="hdr">
        <div className="wrap">
          <a
            className="brand"
            href="#/"
            aria-label="AegisEarth home"
            onClick={goHome}
          >
            <img
              className="brand-symbol"
              src="/favicon.svg"
              alt=""
              width="40"
              height="40"
            />
            <span className="brand-wordmark">
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
                    aria-current={current === item.id ? "page" : undefined}
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

      {!immersive && (
        <footer className="site-footer">
          <div className="wrap footer-grid">
            <div>
              <p className="footer-brand">AegisEarth</p>
              <p className="footer-statement">
                AegisEarth is an independent student project by Team Infraq
                Stargazers. It is not affiliated with or endorsed by NASA.
              </p>
            </div>
            <nav aria-label="Footer">
              <ul className="footer-links">
                <li>
                  <a href="#/">Explorer</a>
                </li>
                <li>
                  <a href="#/learn">Learn</a>
                </li>
                <li>
                  <a href="#/about">About &amp; Sources</a>
                </li>
                <li>
                  <a
                    href="https://github.com/Ahiraf/AegisEarth"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub repository
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </footer>
      )}
    </div>
  );
}
