import { NASA_PLANET_X, type SourceRef } from './sources';

// Planet numbers come from the NASA Planetary Fact Sheet (metric), in its own units.
// Orbital periods in Earth years come from the same sheet's "ratio to Earth" table.
// Moon counts are the ones printed on the fact sheet at the time of writing and can change
// as new moons are confirmed, which is why each card links to the live page.

export type Planet = {
  name: string;
  slug: string;
  distanceMillionKm: string;
  periodDays: string;
  periodYears: string;
  diameterKm: string;
  moons: string;
  rings: string;
  /** Distance in astronomical units. Used only to place the planet in the 3D model. */
  au: number;
  color: number;
  /** Exaggerated display size in the 3D model. */
  size: number;
};

export const PLANETS: Planet[] = [
  { name: 'Mercury', slug: 'mercury', distanceMillionKm: '57.9', periodDays: '88.0', periodYears: '0.241', diameterKm: '4,879', moons: '0', rings: 'No', au: 57.9 / 149.6, color: 0xa89f94, size: 0.07 },
  { name: 'Venus', slug: 'venus', distanceMillionKm: '108.2', periodDays: '224.7', periodYears: '0.615', diameterKm: '12,104', moons: '0', rings: 'No', au: 108.2 / 149.6, color: 0xe0b878, size: 0.12 },
  { name: 'Earth', slug: 'earth', distanceMillionKm: '149.6', periodDays: '365.2', periodYears: '1', diameterKm: '12,756', moons: '1', rings: 'No', au: 1, color: 0x4c9be8, size: 0.13 },
  { name: 'Mars', slug: 'mars', distanceMillionKm: '228.0', periodDays: '687.0', periodYears: '1.88', diameterKm: '6,792', moons: '2', rings: 'No', au: 228.0 / 149.6, color: 0xd1623b, size: 0.1 },
  { name: 'Jupiter', slug: 'jupiter', distanceMillionKm: '778.5', periodDays: '4,331', periodYears: '11.9', diameterKm: '142,984', moons: '95', rings: 'Yes', au: 778.5 / 149.6, color: 0xd9b38c, size: 0.32 },
  { name: 'Saturn', slug: 'saturn', distanceMillionKm: '1,432.0', periodDays: '10,747', periodYears: '29.4', diameterKm: '120,536', moons: '274', rings: 'Yes', au: 1432 / 149.6, color: 0xe3cf9b, size: 0.27 },
  { name: 'Uranus', slug: 'uranus', distanceMillionKm: '2,867.0', periodDays: '30,589', periodYears: '83.7', diameterKm: '51,118', moons: '28', rings: 'Yes', au: 2867 / 149.6, color: 0x8fd8dc, size: 0.18 },
  { name: 'Neptune', slug: 'neptune', distanceMillionKm: '4,515.0', periodDays: '59,800', periodYears: '163.7', diameterKm: '49,528', moons: '16', rings: 'Yes', au: 4515 / 149.6, color: 0x4a6fe3, size: 0.18 },
];

export const planetPageUrl = (p: Planet) => `https://science.nasa.gov/${p.slug}/`;
export const planetFactSheetUrl = (p: Planet) => `https://nssdc.gsfc.nasa.gov/planetary/factsheet/${p.slug}fact.html`;

/** The hypothetical planet. It has never been observed. The marker in the 3D model is illustrative. */
export const PLANET_X_SOURCE: SourceRef = NASA_PLANET_X;
export const PLANET_X_FACTS: { label: string; text: string }[] = [
  { label: 'Status', text: 'Hypothetical. No such planet has been observed.' },
  { label: 'Where the idea comes from', text: 'In January 2016, Caltech researchers Konstantin Batygin and Mike Brown published evidence suggesting a planet in the outer solar system.' },
  { label: 'What was proposed', text: 'A Neptune-sized planet on a highly elongated orbit far beyond Pluto.' },
  { label: 'Open question', text: 'Another possibility is that the planet does not exist at all.' },
];
