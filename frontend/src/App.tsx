import { useEffect, useState } from 'react';
import { Layout, type NavId } from './components/Layout';
import { scrollToId } from './lib/scroll';
import { AboutPage } from './pages/AboutPage';
import { ExplorerPage } from './pages/Explorerpage';
import { LearnPage } from './pages/Learnpage';

type PageId = 'explorer' | 'learn' | 'about';
type Route = { page: PageId; section: string | null };

const TITLES: Record<PageId, string> = {
  explorer: 'Explorer',
  learn: 'Learn',
  about: 'About and Sources',
};

// Hash routes. #/orbits, #/atmosphere and #/solar are sections of the Explorer page.
function routeFromHash(hash: string): Route {
  switch (hash) {
    case '#/learn':
      return { page: 'learn', section: null };
    case '#/about':
      return { page: 'about', section: null };
    case '#/orbits':
      return { page: 'explorer', section: 'orbits' };
    case '#/atmosphere':
      return { page: 'explorer', section: 'atmosphere' };
    case '#/solar':
      return { page: 'explorer', section: 'solar' };
    default:
      return { page: 'explorer', section: null };
  }
}

const SPY_SECTIONS: NavId[] = ['orbits', 'atmosphere', 'solar'];

export function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  const [spy, setSpy] = useState<NavId>('explorer');

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // New page or section: update the title, then scroll to the top or to the requested section.
  useEffect(() => {
    document.title = `${TITLES[route.page]} | AegisEarth`;
    const frame = window.requestAnimationFrame(() => {
      if (route.section) {
        scrollToId(route.section, true);
      } else {
        window.scrollTo(0, 0);
        document.getElementById('main')?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route]);

  // On the Explorer, highlight the navigation item for the section currently in view.
  useEffect(() => {
    if (route.page !== 'explorer') return;
    const update = () => {
      let current: NavId = 'explorer';
      for (const id of SPY_SECTIONS) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top < window.innerHeight * 0.4) current = id;
      }
      setSpy(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [route.page]);

  const current: NavId = route.page === 'explorer' ? spy : route.page;

  return (
    <Layout current={current}>
      {route.page === 'learn' ? <LearnPage /> : route.page === 'about' ? <AboutPage /> : <ExplorerPage />}
    </Layout>
  );
}
