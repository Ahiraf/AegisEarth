import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [status, setStatus] = useState('Checking API connection...');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/health/live', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(() => setStatus('API connected'))
      .catch(error => { if (error.name !== 'AbortError') setStatus('API unavailable. Start the backend to connect.'); });
    return () => controller.abort();
  }, []);
  return <main>
    <p className="eyebrow">NASA SPACE APPS PROJECT · DEVELOPMENT SCAFFOLD</p>
    <h1>AegisEarth</h1>
    <p className="intro">Explore our cosmic neighborhood. Understand the science of planetary defense.</p>
    <p role="status">{status}</p>
    <section aria-labelledby="next"><h2 id="next">The foundation is ready</h2>
      <p>The NEO catalog, interactive visualizations, risk explanations, and learning modules are planned in <code>todo_plan.md</code>.</p>
      <p>No live scientific observations have been imported yet. A close approach does not imply an impact.</p>
      <a href="/docs">Explore the REST API</a>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
