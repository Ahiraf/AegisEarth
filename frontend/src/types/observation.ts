// The shapes the user interface works with.
// Real data (saved records now, the backend later) is mapped into these shapes in ONE place:
// the data provider. Pages and components never read raw API responses.
//
// Rule: if a value is unknown, it is `null`. Never use 0, "" or a made-up default.

/**
 * snapshot  records saved from the NASA/IPAC archive (the default today)
 * api       the future backend (reports "not configured" until it is connected)
 */
export type DataMode = 'snapshot' | 'api';

/** Where a record came from. Drives the labels the user sees. */
export type RecordOrigin = 'saved-snapshot' | 'live-api';

export type SourceLink = { label: string; url: string };
export type SkyPosition = { raDeg: number; decDeg: number };

export type Provenance = {
  /** Name of the archive or provider. */
  sourceName: string | null;
  /** Link straight to the product (file or record) in the provider's archive. */
  sourceRecordUrl: string | null;
  /** Dataset or collection name. */
  dataset: string | null;
  /** Processing release or pipeline version, as the provider names it. */
  processingRelease: string | null;
  /** When this information was obtained (ISO 8601 date or date-time). */
  retrievedAt: string | null;
  /** Documentation and citation links that explain this record. */
  links: SourceLink[];
};

/** How pixel values were turned into the picture on screen (only for records with a preview image). */
export type DisplaySettings = {
  rendering: string | null;
  stretch: string | null;
  colorMap: string | null;
};

/** A browser-displayable image supplied for a record (for example a PNG rendered by the backend). */
export type PreviewImage = { kind: 'url'; url: string; alt: string };

export type Observation = {
  /** Stable key used by the interface. */
  id: string;
  origin: RecordOrigin;
  /** The provider's own product identifier (for IRSA, the product file name). */
  productId: string | null;
  /** The provider's observation identifier. */
  observationId: string | null;
  /** SPHEREx planning-period label (a survey-plan label, not a calendar date). */
  planningPeriod: string | null;
  /** Detector number (SPHEREx has six, one per band). */
  detector: number | null;
  /** Observation time as ISO 8601 text, exactly as supplied. */
  observedAt: string | null;
  /** Time system of `observedAt`, e.g. "UTC", exactly as supplied. */
  timeBasis: string | null;
  /** Date the archive processed this product (YYYY-MM-DD). */
  processedOn: string | null;
  bandLabel: string | null;
  wavelengthMinMicron: number | null;
  wavelengthMaxMicron: number | null;
  /** A sky position known to lie inside this product's footprint. */
  coveredPosition: SkyPosition | null;
  preview: PreviewImage | null;
  display: DisplaySettings;
  provenance: Provenance;
};
