import type { DataMode } from '../types/observation';
import { apiProvider } from './apiProvider';
import { getDataMode } from './config';
import type { ObservationProvider } from './provider';
import { snapshotProvider } from './snapshotProvider';

export { getDataMode };

function createProvider(mode: DataMode): ObservationProvider {
  return mode === 'api' ? apiProvider : snapshotProvider;
}

/** The provider for the current data mode. Pages call `provider.search(...)` only. */
export const provider: ObservationProvider = createProvider(getDataMode());
