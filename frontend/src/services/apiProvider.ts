import { errorMessage, post } from "../features/sky/api";
import type { Discovery } from "../features/sky/types";
import type { ObservationProvider } from "./provider";

/** Adapter for callers of the original observation-record interface. */
export const apiProvider: ObservationProvider = {
  mode: "api",
  async search(params, signal) {
    try {
      const result = await post<Discovery>(
        "/api/v1/observations/search",
        {
          contract_version: "discovery-v1",
          region: {
            ra: params.raDeg,
            dec: params.decDeg,
            width_arcmin: 5,
            height_arcmin: 5,
          },
          start_at: params.startDate + "T00:00:00Z",
          end_at: params.endDate + "T23:59:59Z",
          limit: 100,
        },
        signal,
      );
      return {
        status: "ok",
        observations: result.items.map((p) => ({
          id: p.id,
          origin: "live-api",
          productId: p.id,
          observationId: p.provider_id,
          planningPeriod: null,
          detector: Number(p.detector.slice(1)),
          observedAt: p.start_at_utc,
          timeBasis: "UTC",
          processedOn: null,
          bandLabel: p.detector,
          wavelengthMinMicron: p.image_wavelength_min_um,
          wavelengthMaxMicron: p.image_wavelength_max_um,
          coveredPosition: null,
          preview: null,
          display: { rendering: null, stretch: null, colorMap: null },
          provenance: {
            sourceName: "NASA/IPAC IRSA / SPHEREx",
            sourceRecordUrl: p.access_url,
            dataset: p.collection,
            processingRelease: p.calibration_version,
            retrievedAt: result.created_at_utc,
            links: [],
          },
        })),
        note: result.warnings.join(" "),
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { status: "error", message: errorMessage(error) };
    }
  },
};
