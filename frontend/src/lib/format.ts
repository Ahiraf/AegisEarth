import type { Observation, RecordOrigin } from '../types/observation';

export const NOT_AVAILABLE = 'Not available';

/** "2026-01-12T04:20:00Z" -> "2026-01-12 04:20:00". Text is shown as supplied, never converted. */
export function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/.exec(iso);
  if (!match) return iso;
  return `${match[1]} ${match[2]}${match[3] ? `:${match[3]}` : ''}`;
}

function trimNumber(n: number): string {
  return n.toFixed(2);
}

/** "1.10\u20131.62 \u00b5m" */
export function formatWavelengthRange(o: Observation): string | null {
  if (o.wavelengthMinMicron === null || o.wavelengthMaxMicron === null) return null;
  return `${trimNumber(o.wavelengthMinMicron)}\u2013${trimNumber(o.wavelengthMaxMicron)} \u00b5m`;
}

export function originLabel(origin: RecordOrigin): string {
  return origin === 'saved-snapshot' ? 'Saved from the NASA/IPAC archive' : 'Live record from the data service';
}

/** The identifier people should see: the observation ID, else the product ID, else the key. */
export function observationName(o: Observation): string {
  return o.observationId ?? o.productId ?? o.id;
}

/** Plain-text description for screen readers. */
export function describeObservation(o: Observation): string {
  const range = formatWavelengthRange(o);
  return [
    `Observation ${observationName(o)}`,
    o.bandLabel ? `${o.bandLabel}${range ? `, ${range}` : ''}` : 'band not available',
    o.planningPeriod ? `planning period ${o.planningPeriod}` : 'planning period not available',
  ].join('. ');
}
