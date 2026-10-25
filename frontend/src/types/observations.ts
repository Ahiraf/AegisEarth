export type DataSourceMode = 'demo' | 'api' | 'snapshot';

export interface Observation {
  id: string;
  observedAt: string | null;
  timeBasis: string | null;
  band: string | null;
  wavelength: string | null;
  datasetVersion: string | null;
  processingRelease: string | null;
  sourceName: string;
  sourceRecordUrl: string | null;
  retrievedAt: string | null;
  rightAscensionDeg: number;
  declinationDeg: number;
  synthetic: boolean;
  previewVariant: 'violet' | 'amber' | 'cyan';
  imageUrl?: string | null;
}

export interface ObservationSearch {
  rightAscensionDeg: number;
  declinationDeg: number;
  startDate: string;
  endDate: string;
}

export interface ObservationProvider {
  readonly mode: DataSourceMode;
  searchObservations(search: ObservationSearch): Promise<Observation[]>;
}
