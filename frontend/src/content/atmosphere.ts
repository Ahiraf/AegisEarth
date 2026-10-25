import { NASA_ATMOSPHERE, type SourceRef } from './sources';

// Text for "Layers of Earth's atmosphere", taken from the NASA Science article
// "Earth's Atmosphere: A Multi-layered Cake". Altitudes keep NASA's units (km and miles).
// NASA gives each boundary as an average or a range, so they are shown as ranges.

export type AtmosphereLayer = {
  name: string;
  range: string;
  color: string;
  statements: string[];
};

/** Listed from the top of the atmosphere down. */
export const ATMOSPHERE_LAYERS: AtmosphereLayer[] = [
  {
    name: 'Exosphere', range: '700\u201310,000 km (440\u20136,200 miles)', color: '#1b2a55',
    statements: ['The highest layer. Its top merges with the solar wind.', 'Most Earth satellites orbit here.'],
  },
  {
    name: 'Thermosphere', range: '80\u2013700 km (50\u2013440 miles)', color: '#2d3f8f',
    statements: ['Temperatures rise with altitude. Its lowest part contains the ionosphere.', 'The International Space Station orbits in this layer.'],
  },
  {
    name: 'Mesosphere', range: '50\u201380 km (31\u201350 miles)', color: '#3c6fc4',
    statements: ['Temperatures fall with altitude. The top is the coldest place in the Earth system, averaging about \u221285 \u00b0C (\u2212120 \u00b0F).', 'Most meteors burn up in this layer.'],
  },
  {
    name: 'Stratosphere', range: '12\u201350 km (7.5\u201331 miles)', color: '#4CC3F0',
    statements: ['Temperatures rise with altitude.', 'Contains the ozone layer, which protects life from the Sun\u2019s ultraviolet radiation.'],
  },
  {
    name: 'Troposphere', range: 'Surface to about 12 km (7.5 miles) on average', color: '#7BE0A6',
    statements: ['Lower at the poles and higher at the equator.', 'Holds most of the water vapour and most weather happens here.'],
  },
];

export const ATMOSPHERE_SOURCE: SourceRef = NASA_ATMOSPHERE;

/** Where spacecraft fly, as stated on the same NASA page. */
export const ATMOSPHERE_SPACECRAFT: { title: string; text: string }[] = [
  { title: 'International Space Station', text: 'Orbits in the thermosphere.' },
  { title: 'Most Earth satellites', text: 'Orbit in the exosphere.' },
];

export const EDGE_OF_SPACE =
  'The K\u00e1rm\u00e1n line, 100 km (62 miles) above sea level, is the boundary most scientists use for the edge of space.';
