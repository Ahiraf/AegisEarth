import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ScrollProgress } from "./ScrollProgress";
import "../styles/brand-polish.css";

export type NavId =
  | "home"
  | "explorer"
  | "planet-x"
  | "orbits"
  | "atmosphere"
  | "solar"
  | "learn"
  | "about";

type NavItem = { id: NavId; label: string; href: string };

// Each hash URL mounts its own page; Back, Forward and shared links work.
const NAV: NavItem[] = [
  { id: "explorer", label: "SPHEREx Viewer", href: "#/explorer" },
  { id: "planet-x", label: "Planet X", href: "#/planet-x" },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => setMenuOpen(false), [current]);
  const immersive = ["orbits", "atmosphere", "solar"].includes(current);
  const skipToMain = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("main")?.focus();
  };

  return (
    <div className={current === "home" ? "app-shell landing-shell" : immersive ? "app-shell app-shell-immersive" : "app-shell"}>
      <a className="skip-link" href="#main" onClick={skipToMain}>
        Skip to main content
      </a>
      {!immersive && current !== "home" && <ScrollProgress />}

      <header className="hdr" onKeyDown={event => {
        if (menuOpen && event.key === "Escape") {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }}>
        <div className="wrap">
          <a
            className="brand"
            href="#/home"
            aria-label="AegisEarth home"
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
          <button ref={menuButton} className="site-menu-toggle" type="button"
            aria-expanded={menuOpen} aria-controls="main-navigation"
            onClick={() => setMenuOpen(open => !open)}>
            Menu <span aria-hidden="true">{menuOpen ? "▴" : "▾"}</span>
          </button>
          <nav aria-label="Main" id="main-navigation" data-open={menuOpen}>
            <ul className="nav-list">
              {NAV.map((item) => (
                <li key={item.id}>
                  <a
                    className="nav-link"
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
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

      {!immersive && current !== "home" && (
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
                  <a href="#/explorer">SPHEREx Viewer</a>
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
