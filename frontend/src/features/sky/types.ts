export type TimelineMode = "common" | "native";
export type JsonObject = Record<string, unknown>;
export interface ViewRequest {
  contract_version: "view-v2";
  region: {
    ra: string | number;
    dec: string | number;
    width_arcmin: number;
    height_arcmin: number;
    ra_unit?: string;
    dec_unit?: string;
    frame?: string;
  };
  start_at?: string | null;
  end_at?: string | null;
  collections: string[];
  detectors?: string[];
  wavelength_min_um?: number | null;
  wavelength_max_um?: number | null;
  max_frames: number;
  selection_policy?: string;
  preparation: {
    spectral_mode: "common_available" | "detector" | "channel";
    detector?: string | null;
    channel_id?: number | null;
    temporal_bin_seconds?: number;
    stretch?: "shared_asinh" | "per_frame_asinh";
    native_preview_policy?: "masked" | "inspect_flagged";
    target_exclusion_radius_arcsec?: number;
  };
}
export type CanonicalViewRequest = Omit<ViewRequest, "region"> & {
  region: Omit<ViewRequest["region"], "ra" | "dec"> & {
    ra_deg: number;
    dec_deg: number;
  };
};
export interface Acceptance {
  id: string;
  status_url: string;
  result_url?: string;
  cache_hit: boolean;
  cancel_token?: string;
}
export interface Job {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  attempt: number;
  error_code: string | null;
  expires_at_utc?: string;
  canonical_request?: CanonicalViewRequest;
}
export interface Artifact {
  id: string;
  url?: string;
  sha256: string;
  content_type: string;
  size_bytes: number;
  kind?: string;
  source_product_ids?: string[];
}
export interface Frame {
  id: string;
  ordinal: number;
  kind: string;
  time: {
    start_utc: string;
    end_utc: string;
    label_utc: string;
    mid_mjd_utc: string;
    gap_seconds?: number;
    elapsed_seconds?: number;
  };
  preview: Artifact;
  science: Artifact | null;
  science_image_url: string | null;
  original_inputs: {
    product_id: string;
    source_url?: string;
    collection: string;
    detector: string;
    doi?: string;
    sha256?: string;
    url?: string;
  }[];
  spatial: { shape: [number, number]; mode: string; wcs_header: string };
  spectral: {
    detectors: string[];
    unit: string;
    contributors: JsonObject[];
    quantitative_calibration: boolean;
  };
  stretch: { mode: string; limits_mjy_sr?: number[] | null };
  quality: { comparison_supported: boolean; contributors: JsonObject[] };
  warnings: string[];
}
export interface Timeline {
  mode: TimelineMode;
  outcome: "no_data" | "single_epoch" | "ready_for_animation";
  frame_count: number;
  distinct_epoch_count: number;
  comparison_supported: boolean;
  frames_url: string;
  first_frame: Frame | null;
  warnings: string[];
}
export interface Manifest {
  view_id: string;
  manifest_sha256: string;
  source_registry_version: string;
  source_snapshot_id: string;
  processing_version: string;
  request: CanonicalViewRequest;
  outcome: string;
  timelines: Record<TimelineMode, Timeline>;
  playback: { loop_allowed: boolean };
  warnings: string[];
  provenance: JsonObject;
}
export interface FramePage {
  manifest_sha256: string;
  items: Frame[];
  next_page: string | null;
  total: number;
}
export interface Preparation {
  version: string;
  frames: {
    index: number;
    product_id: string;
    detector: string;
    mid_mjd: number;
    quality: JsonObject;
    registration: JsonObject;
    psf: JsonObject;
  }[];
  warnings: string[];
  pair_eligibility: Record<string, JsonObject>;
}
export interface DetectorOptions {
  detectors: {
    detector: string;
    availability: string;
    input_indices: number[];
  }[];
}
export interface Target {
  slug: string;
  name: string;
  ra_deg: number;
  dec_deg: number;
  reference_epoch_jyear?: number | null;
  pm_ra_cosdec_mas_yr?: number | null;
  pm_dec_mas_yr?: number | null;
  caveats?: string[];
}
export interface Channel {
  id: number;
  detector: string;
  [key: string]: unknown;
}
export interface References {
  targets: Target[];
  channels: Channel[];
  releases: JsonObject[];
  capabilities: Record<string, unknown>;
  registry: string | null;
  refreshChecks: JsonObject[];
  errors: string[];
}
export interface Discovery {
  snapshot_id: string;
  items: SourceProduct[];
  sampled_count: number;
  upstream_complete: boolean;
  warnings: string[];
  next_page: string | null;
  created_at_utc: string;
  revalidate_after_utc: string;
}
export interface SourceProduct {
  id: string;
  provider_id: string;
  detector: string;
  release: string;
  collection: string;
  access_url: string;
  start_at_utc: string;
  end_at_utc: string;
  calibration_version: string;
  image_wavelength_min_um: number;
  image_wavelength_max_um: number;
}
export interface InputRef {
  view_id: string;
  index: number;
}
export interface OverlayMarker {
  id: string;
  survey: string;
  position_status: string;
  display_position: { ra_deg: number; dec_deg: number };
  catalog_fields: Record<string, string | null>;
  pixel: { x_png: number | null; y_png: number | null; inside: boolean };
}
export interface CatalogLayer {
  status: string;
  markers: OverlayMarker[];
  credits: string;
  truncated: boolean;
  retrieved_at_utc: string;
  warnings: string[];
}
export interface WiseLayer {
  band: string;
  png_url: string;
  fits_url: string;
  source: { date_obs1: string; date_obs2: string };
  credits: string;
  warnings: string[];
  spatial: { shape: [number, number] };
}
export interface Sample {
  product_id: string;
  observed_at_utc?: string;
  mid_mjd_utc: string;
  detector: string;
  wavelength_um: number | null;
  bandwidth_um: number | null;
  flux_uJy: number | null;
  flux_error_uJy: number | null;
  status: string;
  reason: string;
  warnings?: string[];
}
export interface DerivedResult {
  kind: string;
  outcome: string;
  artifacts: Artifact[];
  warnings?: string[];
  groups?: {
    indices: number[];
    status: string;
    reasons?: string[];
    unit?: string;
    start_mjd?: number;
    end_mjd?: number;
    artifact_indices?: { planes?: number; preview?: number };
    warnings?: string[];
  }[];
  samples?: Sample[];
  csv_artifact_index?: number;
  eligibility?: { eligible: boolean; reasons: string[] };
  gif_artifact_index?: number;
  provenance_artifact_index?: number;
  frame_count?: number;
  inputs?: JsonObject[];
  request?: JsonObject;
}
export interface Links {
  query: string;
  state: { version: string; request: ViewRequest; mode: TimelineMode };
  embed_path?: string;
  expires_at_utc?: string;
  manifest_sha256?: string;
  warning?: string;
}
