import { JPL_SPHEREX, JPL_SPHEREX_KIT, NASA_HUBBLE_ORBIT, NASA_ISS_FACTS, NASA_ISS_ORBIT, NASA_ORBITS, type SourceRef } from './sources';

// Orbit facts for the "Satellites & space stations" section.
// Each value is copied from the page its link opens, in that page's own units.
// `placementKm` only decides where the ring is drawn on the schematic (log scale). It is never shown.

export type Fact = { label: string; value: string; source: SourceRef };

export type OrbitObject = {
  id: string;
  name: string;
  fullName: string;
  placementKm: number;
  periodHours: number;
  color: string;
  facts: Fact[];
};

export const ORBIT_OBJECTS: OrbitObject[] = [
  {
    id: 'iss', name: 'ISS', fullName: 'International Space Station', placementKm: 420, periodHours: 1.55, color: '#4CC3F0',
    facts: [
      { label: 'Orbit time', value: '90\u201393 minutes', source: NASA_ISS_ORBIT },
      { label: 'Orbits in 24 hours', value: '16', source: NASA_ISS_FACTS },
      { label: 'Inclination', value: '51.6\u00b0', source: NASA_ISS_ORBIT },
      { label: 'Crewed', value: 'Continuously since November 2000', source: NASA_ISS_FACTS },
    ],
  },
  {
    id: 'hubble', name: 'Hubble', fullName: 'Hubble Space Telescope', placementKm: 525, periodHours: 1.58, color: '#C9A7FF',
    facts: [
      { label: 'Altitude', value: '525 km (326 miles)', source: NASA_HUBBLE_ORBIT },
      { label: 'Speed', value: '27,000 km/h (17,000 mph)', source: NASA_HUBBLE_ORBIT },
      { label: 'Orbit time', value: 'About every 95 minutes', source: NASA_HUBBLE_ORBIT },
    ],
  },
  {
    id: 'spherex', name: 'SPHEREx', fullName: 'SPHEREx', placementKm: 650, periodHours: 1.63, color: '#F5B942',
    facts: [
      { label: 'Altitude', value: '650 km (404 miles)', source: JPL_SPHEREX_KIT },
      { label: 'Orbit', value: 'Polar, Sun-synchronous', source: JPL_SPHEREX_KIT },
      { label: 'Launched', value: 'March 11, 2025', source: JPL_SPHEREX },
      { label: 'Sky survey', value: 'The entire sky every six months', source: JPL_SPHEREX },
    ],
  },
  {
    id: 'galileo', name: 'Galileo', fullName: 'Galileo navigation satellites (medium-Earth orbit)', placementKm: 23222, periodHours: 14, color: '#FF8A65',
    facts: [
      { label: 'Altitude', value: '23,222 km', source: NASA_ORBITS },
      { label: 'Orbit class', value: 'Medium-Earth orbit, 2,000 to 35,500 km', source: NASA_ORBITS },
      { label: 'Orbit time in this class', value: 'About 12 hours', source: NASA_ORBITS },
      { label: 'Used for', value: 'Telecommunications and GPS platforms', source: NASA_ORBITS },
    ],
  },
  {
    id: 'goes', name: 'GOES', fullName: 'GOES weather satellites (geostationary orbit)', placementKm: 35786, periodHours: 23.93, color: '#F06292',
    facts: [
      { label: 'Altitude', value: '35,786 km', source: NASA_ORBITS },
      { label: 'Orbit', value: 'Speed matches Earth\u2019s rotation, so the satellite stays over one place', source: NASA_ORBITS },
    ],
  },
];
