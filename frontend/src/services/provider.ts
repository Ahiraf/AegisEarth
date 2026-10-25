import type { DataMode, Observation, SourceLink } from '../types/observation';

export type SearchParams = {
  /** Right ascension in decimal degrees, 0 (included) to 360 (excluded). */
  raDeg: number;
  /** Declination in decimal degrees, -90 to 90. */
  decDeg: number;
  /** First day to include, as YYYY-MM-DD. */
  startDate: string;
  /** Last day to include, as YYYY-MM-DD. */
  endDate: string;
};

export type SearchResult =
  | {
      status: 'ok';
      observations: Observation[];
      /** Optional plain-language note shown with the results. */
      note?: string;
      noteLink?: SourceLink;
    }
  | { status: 'not-configured'; message: string }
  | { status: 'error'; message: string };

/**
 * The ONE boundary between the interface and its data.
 * To connect the real backend: implement this interface (see apiProvider.ts)
 * and map the backend response into `Observation` objects.
 */
export interface ObservationProvider {
  readonly mode: DataMode;
  search(params: SearchParams, signal?: AbortSignal): Promise<SearchResult>;
}
