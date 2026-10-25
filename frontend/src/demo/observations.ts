import type { Observation } from '../types/observations';

// Every record below is fabricated solely to demonstrate the interface.
export const DEMO_OBSERVATIONS: Observation[] = [
  {
    id: 'DEMO-ONLY-001', observedAt: '2025-02-14T03:20:00Z', timeBasis: 'UTC (illustrative)',
    band: 'Synthetic band A', wavelength: null, datasetVersion: null, processingRelease: null,
    sourceName: 'AegisEarth synthetic fixture', sourceRecordUrl: null, retrievedAt: null,
    rightAscensionDeg: 83.2, declinationDeg: -5.4, synthetic: true, previewVariant: 'violet',
  },
  {
    id: 'DEMO-ONLY-002', observedAt: '2025-03-02T03:20:00Z', timeBasis: 'UTC (illustrative)',
    band: 'Synthetic band B', wavelength: null, datasetVersion: null, processingRelease: null,
    sourceName: 'AegisEarth synthetic fixture', sourceRecordUrl: null, retrievedAt: null,
    rightAscensionDeg: 83.2, declinationDeg: -5.4, synthetic: true, previewVariant: 'amber',
  },
  {
    id: 'DEMO-ONLY-003', observedAt: '2025-03-18T03:20:00Z', timeBasis: 'UTC (illustrative)',
    band: 'Synthetic band A', wavelength: null, datasetVersion: null, processingRelease: null,
    sourceName: 'AegisEarth synthetic fixture', sourceRecordUrl: null, retrievedAt: null,
    rightAscensionDeg: 83.4, declinationDeg: -5.3, synthetic: true, previewVariant: 'cyan',
  },
];
