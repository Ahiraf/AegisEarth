import type { DataSourceMode } from '../types/observations';

const configuredMode = import.meta.env.VITE_DATA_SOURCE;

// Only an explicit "demo" selects fixtures. Unrecognized and future modes fail closed.
export const dataSourceMode: DataSourceMode = configuredMode === 'demo'
  ? 'demo'
  : configuredMode === 'snapshot' ? 'snapshot' : 'api';

export const invalidDataSourceMode = configuredMode !== undefined
  && !['demo', 'api', 'snapshot'].includes(configuredMode);
