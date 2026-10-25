import { IRSA_SPHEREX_URL, SNAPSHOT_RECORDS } from '../data/irsaSnapshot';
import { angularSeparationDeg } from '../lib/sky';
import type { ObservationProvider } from './provider';

/** A saved record is listed when your position is within this angle of a position it is known to cover. */
export const SEARCH_RADIUS_DEG = 0.5;

// Searches the SPHEREx records saved from IRSA (see data/irsaSnapshot.ts).
//  - Position: records known to cover a point within SEARCH_RADIUS_DEG of the search position.
//  - Dates:    the date IRSA processed the product (the exact observation time is not stored).
export const snapshotProvider: ObservationProvider = {
  mode: 'snapshot',
  async search(params) {
    const here = { raDeg: params.raDeg, decDeg: params.decDeg };
    const observations = SNAPSHOT_RECORDS.filter(
      (o) =>
        o.coveredPosition !== null &&
        angularSeparationDeg(here, o.coveredPosition) <= SEARCH_RADIUS_DEG &&
        o.processedOn !== null &&
        o.processedOn >= params.startDate &&
        o.processedOn <= params.endDate,
    );
    return {
      status: 'ok',
      observations,
      note: 'A selection of SPHEREx spectral images saved from NASA/IPAC IRSA. Dates refer to when IRSA processed each product.',
      noteLink: { label: 'Search the full archive at IRSA', url: IRSA_SPHEREX_URL },
    };
  },
};
