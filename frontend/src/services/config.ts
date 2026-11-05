import type { DataMode } from '../types/observation';

/**
 * Reads VITE_DATA_SOURCE (set in frontend/.env.local, then restart `npm run dev`).
 *   snapshot  explicitly selected records saved from the NASA/IPAC archive
 *   api       live FastAPI workflow (default)
 */
export function getDataMode(): DataMode {
  const raw = import.meta.env.VITE_DATA_SOURCE?.trim().toLowerCase();
  if (raw === 'api' || raw === 'snapshot') return raw;
  if (raw) {
    console.warn(`VITE_DATA_SOURCE="${raw}" is not recognised. Use "snapshot" or "api". Using "api".`);
  }
  return 'api';
}
