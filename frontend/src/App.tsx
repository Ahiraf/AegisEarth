import { useEffect, useRef, useState } from 'react';
import { Layout, type PageId } from './components/Layout';
import { AboutPage } from './pages/AboutPage';
import { ExplorerPage } from './pages/Explorerpage';
import { LearnPage } from './pages/Learnpage';

const TITLES: Record<PageId, string> = {
  explorer: 'Explorer',
  learn: 'Learn',
  about: 'About and Sources',
};

function pageFromHash(hash: string): PageId {
  if (hash === '#/learn') return 'learn';
  if (hash === '#/about') return 'about';
  return 'explorer';
}

export function App() {
  const [page, setPage] = useState<PageId>(() => pageFromHash(window.location.hash));
  const previousPage = useRef(page);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.title = `${TITLES[page]} | AegisEarth`;
    if (previousPage.current !== page) {
      previousPage.current = page;
      window.scrollTo(0, 0);
      document.getElementById('main')?.focus();
    }
  }, [page]);

  return (
    <Layout current={page}>
      {page === 'learn' ? <LearnPage /> : page === 'about' ? <AboutPage /> : <ExplorerPage />}
    </Layout>
  );
}