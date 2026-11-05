import type {
  Frame,
  Manifest,
  Preparation,
  ViewRequest,
} from "../src/features/sky/types";

export const VIEW = "00000000-0000-4000-8000-000000000100";
export const OTHER = "00000000-0000-4000-8000-000000000200";
export const TOKEN = "f".repeat(64); // Controlled UI-test capability; never used with a real server.
export const criteria: ViewRequest = {
  contract_version: "view-v2",
  region: { ra: 133.76, dec: -7.24, width_arcmin: 5, height_arcmin: 5 },
  collections: ["spherex_qr3"],
  detectors: [],
  max_frames: 3,
  preparation: {
    spectral_mode: "detector",
    detector: "D6",
    temporal_bin_seconds: 0,
    stretch: "shared_asinh",
    native_preview_policy: "masked",
    target_exclusion_radius_arcsec: 30,
  },
};
export function artifact(index: number, kind = "image/png") {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    url: `/api/v1/artifacts/00000000-0000-4000-8000-${String(index).padStart(12, "0")}/content`,
    sha256: "a".repeat(64),
    content_type: kind,
    size_bytes: 1000,
  };
}
export function frame(index: number, viewId = VIEW, mode = "common"): Frame {
  const png = artifact(
    index + 1 + (viewId === OTHER ? 100 : 0) + (mode === "native" ? 10 : 0),
  );
  const science = artifact(index + 30, "application/fits");
  return {
    id: `${viewId}-${mode}-${index}`,
    ordinal: index,
    kind: "observation",
    time: {
      start_utc: `2026-04-${21 + index}T10:00:00Z`,
      end_utc: `2026-04-${21 + index}T10:01:00Z`,
      label_utc: `2026-04-${21 + index}T10:00:30Z`,
      mid_mjd_utc: String(61151 + index),
      gap_seconds: index ? 86340 : 0,
    },
    preview: png,
    science,
    science_image_url:
      mode === "common" ? `/api/v1/artifacts/${science.id}/science.fits` : null,
    original_inputs: [
      {
        product_id: `ui-test-product-${index}`,
        collection: "spherex_qr3",
        detector: "D6",
        source_url:
          "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/ui-test.fits",
        doi: "10.26131/IRSA662",
      },
    ],
    spatial: {
      shape: [64, 64],
      mode: mode === "common" ? "sky_fixed" : "native",
      wcs_header: "",
    },
    spectral: {
      detectors: ["D6"],
      unit: "MJy/sr",
      contributors: [],
      quantitative_calibration: false,
    },
    stretch: { mode: "shared_asinh", limits_mjy_sr: [1, 10] },
    quality: {
      comparison_supported: false,
      contributors: [
        {
          mask: { usable_fraction: 0.9 },
          registration: { validated: false },
          psf: { applied_psf_matching: false },
        },
      ],
    },
    warnings: [
      "Controlled UI test fixture. Scientific comparison is unvalidated.",
    ],
  };
}
export function manifest(count = 3, id = VIEW, request = criteria): Manifest {
  const common = Array.from({ length: count }, (_, i) => frame(i, id));
  const native = Array.from({ length: count }, (_, i) =>
    frame(i, id, "native"),
  );
  const outcome =
    count === 0
      ? "no_data"
      : count === 1
        ? "single_epoch"
        : "ready_for_animation";
  return {
    view_id: id,
    manifest_sha256: "b".repeat(64),
    source_registry_version: "ui-test-registry",
    source_snapshot_id: "00000000-0000-4000-8000-000000000900",
    processing_version: "frames-v1",
    request: {
      ...request,
      region: {
        ...request.region,
        ra_deg: Number(request.region.ra),
        dec_deg: Number(request.region.dec),
      },
    },
    outcome,
    timelines: {
      common: {
        mode: "common",
        outcome,
        frame_count: count,
        distinct_epoch_count: count,
        comparison_supported: false,
        frames_url: `/api/v1/views/${id}/frames?mode=common`,
        first_frame: common[0] || null,
        warnings: [],
      },
      native: {
        mode: "native",
        outcome,
        frame_count: count,
        distinct_epoch_count: count,
        comparison_supported: false,
        frames_url: `/api/v1/views/${id}/frames?mode=native`,
        first_frame: native[0] || null,
        warnings: ["Native orientation differs."],
      },
    },
    playback: { loop_allowed: count >= 2 },
    warnings: [
      "UI-test contract data; no validated motion or calibrated variability.",
    ],
    provenance: { provider: "NASA/IPAC IRSA / SPHEREx" },
  };
}
export function preparation(id = VIEW, count = 3): Preparation {
  // Deliberately different order from the movie: preparation indices must not be movie ordinals.
  const order =
    count === 3 ? [2, 0, 1] : Array.from({ length: count }, (_, i) => i);
  return {
    version: "frames-v1",
    frames: order.map((i, index) => ({
      index,
      product_id: `${id === OTHER ? "other-" : ""}ui-test-product-${i}`,
      detector: id === OTHER ? "D1" : "D6",
      mid_mjd: 61151 + i,
      quality: {},
      registration: { validated: false },
      psf: {},
    })),
    warnings: [],
    pair_eligibility: {},
  };
}
export function svg(index = 0) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#050b14"/><circle cx="${25 + index * 4}" cy="30" r="3" fill="white"/><circle cx="48" cy="14" r="2" fill="#b8cadd"/><text x="3" y="59" font-size="6" fill="#4cc3f0">UI TEST FIXTURE</text></svg>`;
}
