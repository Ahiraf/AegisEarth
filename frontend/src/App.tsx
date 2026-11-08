import { lazy, Suspense, useEffect, useState } from "react";
import { Layout, type NavId } from "./components/Layout";
const ExplorerPage = lazy(() =>
  import("./pages/Explorerpage").then((m) => ({ default: m.ExplorerPage })),
);
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
  explorer: "Explorer",
  orbits: "Satellites & space stations",
  atmosphere: "Earth’s atmosphere",
  solar: "Solar System",
  learn: "Learn",
  about: "About and Sources",
};
function routeFromHash(): NavId {
  const name = window.location.hash.split("?")[0].replace(/^#\//, "");
  return Object.hasOwn(TITLES, name) ? (name as NavId) : "explorer";
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
        {page === "learn" ? (
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
