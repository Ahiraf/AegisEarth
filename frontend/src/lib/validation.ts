import type { SearchParams } from '../services/provider';

export type SearchFormValues = {
  ra: string;
  dec: string;
  startDate: string;
  endDate: string;
};

export type FieldName = keyof SearchFormValues;
export type SearchFormErrors = Partial<Record<FieldName, string>>;

export const FIELD_ORDER: FieldName[] = ['ra', 'dec', 'startDate', 'endDate'];

/** Returns the number, or null if the text is empty or not a number. */
export function parseCoordinate(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function validateSearch(values: SearchFormValues): {
  errors: SearchFormErrors;
  params: SearchParams | null;
} {
  const errors: SearchFormErrors = {};

  const ra = parseCoordinate(values.ra);
  if (values.ra.trim() === '') errors.ra = 'Enter a right ascension (RA) from 0 up to 360 degrees.';
  else if (ra === null) errors.ra = 'RA must be a number in decimal degrees, for example 180.5.';
  else if (ra < 0 || ra >= 360) errors.ra = 'RA must be at least 0 and less than 360 degrees.';

  const dec = parseCoordinate(values.dec);
  if (values.dec.trim() === '') errors.dec = 'Enter a declination (Dec) from \u221290 to 90 degrees.';
  else if (dec === null) errors.dec = 'Dec must be a number in decimal degrees, for example 10.25.';
  else if (dec < -90 || dec > 90) errors.dec = 'Dec must be between \u221290 and 90 degrees.';

  if (!values.startDate) errors.startDate = 'Choose a start date.';
  if (!values.endDate) errors.endDate = 'Choose an end date.';
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = 'The end date must be on or after the start date.';
  }

  if (Object.keys(errors).length > 0 || ra === null || dec === null) {
    return { errors, params: null };
  }
  return {
    errors,
    params: { raDeg: ra, decDeg: dec, startDate: values.startDate, endDate: values.endDate },
  };
}
