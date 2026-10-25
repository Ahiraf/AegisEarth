import type { ObservationProvider } from './provider';

// PLACEHOLDER for the future backend. No API contract has been agreed yet, so this provider
// makes NO network request and invents no endpoint. It reports "not configured" and never
// falls back to the saved records.
//
// To connect the real backend later:
//   1. Get the agreed endpoint, parameters and a real sample response.
//   2. Call it here with fetch(), passing `signal`.
//   3. Map the response into `Observation` objects (types/observation.ts).
//   4. Return { status: 'ok', observations } or { status: 'error', message }.
export const apiProvider: ObservationProvider = {
  mode: 'api',
  async search() {
    return {
      status: 'not-configured',
      message:
        'The live data connection is not set up yet, so no search was sent. ' +
        'To browse the saved SPHEREx records, set VITE_DATA_SOURCE=snapshot (or remove the setting) and restart the dev server.',
    };
  },
};
