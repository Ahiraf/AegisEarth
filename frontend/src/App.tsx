import { lazy, Suspense, useEffect, useState } from "react";
import { Layout, type NavId } from "./components/Layout";
const LandingPage = lazy(() => import("./components/explorer/HeroSection"));
const ExplorerPage = lazy(() =>
  import("./pages/Explorerpage").then((m) => ({ default: m.ExplorerPage })),
);
const PlanetXPage = lazy(() => import("./pages/PlanetXPage"));
const LearnPage = lazy(() =>
  import("./pages/Learnpage").then((m) => ({ default: m.LearnPage })),
);
const AboutPage = lazy(() =>
  import("./pages/AboutPage").then((m) => ({ default: m.AboutPage })),
);
const WorldPage = lazy(() =>
  import("./pages/WorldPage").then((m) => ({ default: m.WorldPage })),
);
const TITLES: Record<NavId, string> = {
  home: "Home",
  explorer: "SPHEREx Viewer",
  "planet-x": "Planet X",
  orbits: "Satellites & space stations",
  atmosphere: "Earth’s atmosphere",
  solar: "Solar System",
  learn: "Learn",
  about: "About and Sources",
};
function routeFromHash(): NavId {
  const name = window.location.hash.split("?")[0].replace(/^#\//, "");
  if (!name) {
    const query = new URLSearchParams(location.search);
    if (["view", "v", "source"].some(key => query.has(key))) return "explorer";
  }
  return Object.hasOwn(TITLES, name) ? (name as NavId) : "home";
}
export function App() {
  const [page, setPage] = useState(routeFromHash);
  useEffect(() => {
    const change = () => setPage(routeFromHash());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.title = `${TITLES[page]} | AegisEarth`;
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [page]);
  return (
    <Layout current={page}>
      <Suspense
        fallback={
          <p className="page-loading" role="status">
            Opening {TITLES[page]}…
          </p>
        }
      >
        {page === "home" ? (
          <LandingPage />
        ) : page === "planet-x" ? (
          <PlanetXPage />
        ) : page === "learn" ? (
          <LearnPage />
        ) : page === "about" ? (
          <AboutPage />
        ) : page === "explorer" ? (
          <ExplorerPage />
        ) : (
          <WorldPage key={page} kind={page} />
        )}
      </Suspense>
    </Layout>
  );
}
