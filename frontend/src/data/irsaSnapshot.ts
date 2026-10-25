import type { Observation, SkyPosition, SourceLink } from '../types/observation';

// SPHEREx spectral-image records saved from the NASA/IPAC Infrared Science Archive (IRSA).
//
// Where each value comes from (all on irsa.ipac.caltech.edu or caltech-ipac.github.io):
//  - Product file names:  IRSA tutorials "Introduction to SPHEREx Spectral Images" and
//    "Download a collection of SPHEREx Spectral Image cutouts as a multi-extension FITS file".
//  - How to read a file name (planning period, observation ID, detector, version, processing
//    date as year-day-of-year):  SPHEREx Archive at IRSA User Guide, "SPHEREx Data Products".
//  - Bands 1-6 and their wavelength ranges:  the same intro tutorial.
//  - Dataset DOI 10.26131/IRSA652 (Quick Release 2):  IRSA SPHEREx Quick Release overview.
// Nothing here is estimated. Fields the sources do not give (such as the exact observation
// time) stay null and the interface shows "Not available".

export const SNAPSHOT_RETRIEVED_ON = '2026-10-19';

export type SpherexBand = { band: number; minMicron: number; maxMicron: number };

/** SPHEREx bands as defined by IRSA (detector n records band n). */
export const SPHEREX_BANDS: SpherexBand[] = [
  { band: 1, minMicron: 0.75, maxMicron: 1.09 },
  { band: 2, minMicron: 1.1, maxMicron: 1.62 },
  { band: 3, minMicron: 1.63, maxMicron: 2.41 },
  { band: 4, minMicron: 2.42, maxMicron: 3.82 },
  { band: 5, minMicron: 3.83, maxMicron: 4.41 },
  { band: 6, minMicron: 4.42, maxMicron: 5.0 },
];

export const IRSA_SPHEREX_URL = 'https://irsa.ipac.caltech.edu/Missions/spherex.html';
export const IRSA_QR_OVERVIEW_URL = 'https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html';
export const IRSA_DATA_PRODUCTS_URL = 'https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products';
export const IRSA_QR2_DOI_URL = 'https://www.ipac.caltech.edu/doi/10.26131/IRSA652';
const INTRO_TUTORIAL_URL = 'https://caltech-ipac.github.io/irsa-tutorials/spherex-intro';
const CUTOUT_TUTORIAL_URL = 'https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts';

/** Positions that the saved records are known to cover. */
export const M101: SkyPosition = { raDeg: 210.80227, decDeg: 54.34895 }; // the Pinwheel Galaxy
export const TUTORIAL_FIELD: SkyPosition = { raDeg: 304.693508808, decDeg: 42.4436872991 };

export type ExamplePosition = { label: string; position: SkyPosition };
export const EXAMPLE_POSITIONS: ExamplePosition[] = [
  { label: 'Pinwheel Galaxy (M101)', position: M101 },
  { label: 'IRSA tutorial field', position: TUTORIAL_FIELD },
];

// file name pattern:
// level2_<planning period>_<large slew>_<small slew>D<detector>_spx_l2b-v<version>-<year>-<day of year>.fits
const PRODUCT_NAME = /^level2_(\d{4}W\d{2}_\d[A-Z])_(\d{4})_(\d+)D(\d)_spx_l2b-v(\d+)-(\d{4})-(\d{3})\.fits$/;

/** "2025", 250 -> "2025-09-07" (the archive writes the processing date as year-day-of-year). */
export function dateFromDayOfYear(year: number, dayOfYear: number): string {
  return new Date(Date.UTC(year, 0, dayOfYear)).toISOString().slice(0, 10);
}

type Listing = { file: string; coveredPosition: SkyPosition; tutorialUrl: string; tutorialName: string };

function toObservation(listing: Listing): Observation {
  const match = PRODUCT_NAME.exec(listing.file);
  if (!match) throw new Error(`Unrecognised SPHEREx product name: ${listing.file}`);
  const [, planningPeriod, largeSlew, smallSlew, detectorText, version, processedYear, processedDay] = match;
  const detector = Number(detectorText);
  const band = SPHEREX_BANDS.find((b) => b.band === detector) ?? null;
  const productUrl =
    `https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level2/${planningPeriod}/` +
    `l2b-v${version}-${processedYear}-${processedDay}/${detector}/${listing.file}`;
  const links: SourceLink[] = [
    { label: 'Product file in the IRSA archive (FITS)', url: productUrl },
    { label: listing.tutorialName, url: listing.tutorialUrl },
    { label: 'How SPHEREx product names are defined', url: IRSA_DATA_PRODUCTS_URL },
    { label: 'Quick Release 2 dataset (DOI 10.26131/IRSA652)', url: IRSA_QR2_DOI_URL },
    { label: 'SPHEREx at IRSA (search and viewing tools)', url: IRSA_SPHEREX_URL },
  ];
  return {
    id: listing.file,
    origin: 'saved-snapshot',
    productId: listing.file,
    observationId: `${planningPeriod}_${largeSlew}_${smallSlew}`,
    planningPeriod,
    detector,
    observedAt: null,
    timeBasis: null,
    processedOn: dateFromDayOfYear(Number(processedYear), Number(processedDay)),
    bandLabel: band ? `Band ${band.band}` : null,
    wavelengthMinMicron: band ? band.minMicron : null,
    wavelengthMaxMicron: band ? band.maxMicron : null,
    coveredPosition: listing.coveredPosition,
    preview: null,
    display: { rendering: null, stretch: null, colorMap: null },
    provenance: {
      sourceName: 'NASA/IPAC Infrared Science Archive (IRSA)',
      sourceRecordUrl: productUrl,
      dataset: 'SPHEREx Quick Release 2 (QR2) spectral images',
      processingRelease: `l2b-v${version}`,
      retrievedAt: SNAPSHOT_RETRIEVED_ON,
      links,
    },
  };
}

const CUTOUTS = { tutorialUrl: CUTOUT_TUTORIAL_URL, tutorialName: 'IRSA tutorial that lists this product' };
const INTRO = { tutorialUrl: INTRO_TUTORIAL_URL, tutorialName: 'IRSA tutorial that uses this product' };

// Six products that cover the Pinwheel Galaxy (M101) in detector 2, listed by the IRSA cutout tutorial,
// and the first product returned by the intro tutorial for its example position.
const LISTINGS: Listing[] = [
  { file: 'level2_2025W22_1B_0129_1D2_spx_l2b-v20-2025-250.fits', coveredPosition: M101, ...CUTOUTS },
  { file: 'level2_2025W50_2A_0072_2D2_spx_l2b-v20-2025-349.fits', coveredPosition: M101, ...CUTOUTS },
  { file: 'level2_2025W50_2A_0129_1D2_spx_l2b-v20-2025-349.fits', coveredPosition: M101, ...CUTOUTS },
  { file: 'level2_2026W20_2A_0464_2D2_spx_l2b-v25-2026-140.fits', coveredPosition: M101, ...CUTOUTS },
  { file: 'level2_2026W21_2A_0081_3D2_spx_l2b-v25-2026-147.fits', coveredPosition: M101, ...CUTOUTS },
  { file: 'level2_2026W21_2A_0361_4D2_spx_l2b-v25-2026-147.fits', coveredPosition: M101, ...CUTOUTS },
  { file: 'level2_2025W43_1A_0516_1D5_spx_l2b-v20-2025-299.fits', coveredPosition: TUTORIAL_FIELD, ...INTRO },
];

/** Oldest planning period first. */
export const SNAPSHOT_RECORDS: Observation[] = LISTINGS.map(toObservation).sort((a, b) =>
  `${a.planningPeriod}${a.observationId}`.localeCompare(`${b.planningPeriod}${b.observationId}`),
);
