import type { Observation } from '../types/observation';
import { observationName } from './format';

export type FactTone = 'same' | 'different' | 'unknown' | 'info';
export type CompareFact = { label: string; tone: FactTone; verdict: string; detail: string };

/**
 * Plain facts about how two observations differ, taken ONLY from their fields.
 * This is not a scientific analysis and it never says whether anything moved.
 */
export function compareFacts(a: Observation, b: Observation): CompareFact[] {
  const facts: CompareFact[] = [];

  // Wavelength band
  if (a.bandLabel && b.bandLabel) {
    facts.push(
      a.bandLabel === b.bandLabel
        ? { label: 'Wavelength band', tone: 'same', verdict: 'Same band', detail: `Both record ${a.bandLabel}, so their wavelengths are directly comparable.` }
        : {
            label: 'Wavelength band',
            tone: 'different',
            verdict: 'Different bands',
            detail: `${observationName(a)} records ${a.bandLabel}; ${observationName(b)} records ${b.bandLabel}. Differences in appearance are expected.`,
          },
    );
  } else {
    facts.push({ label: 'Wavelength band', tone: 'unknown', verdict: 'Unknown', detail: 'The band is missing for at least one observation.' });
  }

  // When they were taken: planning periods are survey-plan labels, not dates.
  if (a.planningPeriod && b.planningPeriod) {
    facts.push(
      a.planningPeriod === b.planningPeriod
        ? { label: 'Planning period', tone: 'same', verdict: 'Same period', detail: `Both are from planning period ${a.planningPeriod}.` }
        : {
            label: 'Planning period',
            tone: 'info',
            verdict: 'Different periods',
            detail: `${a.planningPeriod} and ${b.planningPeriod}. A planning period is a survey-plan label of about 3.5 days.`,
          },
    );
  } else {
    facts.push({ label: 'Planning period', tone: 'unknown', verdict: 'Unknown', detail: 'The planning period is missing for at least one observation.' });
  }

  // Processing version
  if (a.provenance.processingRelease && b.provenance.processingRelease) {
    facts.push(
      a.provenance.processingRelease === b.provenance.processingRelease
        ? { label: 'Processing version', tone: 'same', verdict: 'Same version', detail: `Both were processed with ${a.provenance.processingRelease}.` }
        : {
            label: 'Processing version',
            tone: 'different',
            verdict: 'Different versions',
            detail: `${a.provenance.processingRelease} and ${b.provenance.processingRelease}. A newer processing version can change how an image looks.`,
          },
    );
  } else {
    facts.push({ label: 'Processing version', tone: 'unknown', verdict: 'Unknown', detail: 'The processing version is missing for at least one observation.' });
  }

  return facts;
}
