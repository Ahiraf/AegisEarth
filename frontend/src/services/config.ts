import type { DataMode } from '../types/observation';

/**
 * Reads VITE_DATA_SOURCE (set in frontend/.env.local, then restart `npm run dev`).
 *   snapshot  records saved from the NASA/IPAC archive (default)
 *   api       the future backend (shows a clear message until it is connected)
 */
export function getDataMode(): DataMode {
  const raw = import.meta.env.VITE_DATA_SOURCE?.trim().toLowerCase();
  if (raw === 'api' || raw === 'snapshot') return raw;
  if (raw) {
    console.warn(`VITE_DATA_SOURCE="${raw}" is not recognised. Use "snapshot" or "api". Using "snapshot".`);
  }
  return 'snapshot';
}
