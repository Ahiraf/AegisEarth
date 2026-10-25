import { DEMO_OBSERVATIONS } from '../demo/observations';
import { dataSourceMode, invalidDataSourceMode } from './config';
import type { Observation, ObservationProvider, ObservationSearch } from '../types/observations';

export class ProviderConfigurationError extends Error {}

function createDemoProvider(): ObservationProvider {
  return {
    mode: 'demo',
    async searchObservations(search: ObservationSearch) {
      const start = search.startDate ? Date.parse(`${search.startDate}T00:00:00Z`) : -Infinity;
      const end = search.endDate ? Date.parse(`${search.endDate}T23:59:59Z`) : Infinity;
      return DEMO_OBSERVATIONS.filter((record) => {
        const date = record.observedAt ? Date.parse(record.observedAt) : NaN;
        return Math.abs(record.rightAscensionDeg - search.rightAscensionDeg) <= 1
          && Math.abs(record.declinationDeg - search.declinationDeg) <= 1
          && date >= start && date <= end;
      });
    },
  };
}

function createUnconfiguredProvider(mode: 'api' | 'snapshot'): ObservationProvider {
  return {
    mode,
    async searchObservations(): Promise<Observation[]> {
      const name = mode === 'api' ? 'API integration' : 'Verified snapshot';
      throw new ProviderConfigurationError(`${name} is not configured. No records were loaded.`);
    },
  };
}

export const observationProvider: ObservationProvider = invalidDataSourceMode
  ? createUnconfiguredProvider('api')
  : dataSourceMode === 'demo' ? createDemoProvider() : createUnconfiguredProvider(dataSourceMode);
