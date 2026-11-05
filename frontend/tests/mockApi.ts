import type { Page, Route } from "@playwright/test";
import {
  artifact,
  criteria,
  frame,
  manifest,
  OTHER,
  preparation,
  svg,
  TOKEN,
  VIEW,
} from "./fixtures";

interface Options {
  count?: number;
  hold?: boolean;
  expire?: boolean;
  loseFirstSubmission?: boolean;
  overlayFailure?: boolean;
  quota?: boolean;
  delayFirstManifest?: boolean;
}
export async function mockApi(page: Page, options: Options = {}) {
  const count = options.count ?? 3;
  const calls: {
    path: string;
    method: string;
    body: any;
    key: string | undefined;
    authorization: string | undefined;
  }[] = [];
  const keys = new Map<string, string>();
  const jobs = new Map<
    string,
    { kind: string; calls: number; canceled: boolean }
  >();
  let serial = 500;
  let lost = false;
  let request = structuredClone(criteria);
  let overlayFailures = options.overlayFailure ? 1 : 0;
  async function json(
    route: Route,
    value: unknown,
    status = 200,
    extra: Record<string, string> = {},
  ) {
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: { "Retry-After": "1", ...extra },
      body: JSON.stringify(value),
    });
  }
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = method === "POST" ? req.postDataJSON() : undefined;
    const key = req.headers()["idempotency-key"];
    calls.push({
      path,
      method,
      body,
      key,
      authorization: req.headers().authorization,
    });
    if (path === "/api/v1/views/session")
      return json(route, { status: "ready" }, 200, {
        "Set-Cookie":
          "cosmic_view_client=ui-test-session; HttpOnly; Path=/; SameSite=Lax",
      });
    if (path === "/api/v1/targets")
      return json(route, {
        items: [
          {
            slug: "barnards-star",
            name: "Barnard's Star",
            ra_deg: 269.45,
            dec_deg: 4.69,
            reference_epoch_jyear: 2016,
            pm_ra_cosdec_mas_yr: -801,
            pm_dec_mas_yr: 10300,
            caveats: ["Catalog position; apply epoch limits."],
          },
          {
            slug: "epsilon-indi-b",
            name: "Epsilon Indi B",
            ra_deg: 331,
            dec_deg: -56,
            reference_epoch_jyear: 2000,
            caveats: [],
          },
          {
            slug: "wise-0855",
            name: "WISE 0855",
            ra_deg: 133.76,
            dec_deg: -7.24,
            reference_epoch_jyear: 2000,
            pm_ra_cosdec_mas_yr: -8000,
            caveats: ["High proper motion."],
          },
          {
            slug: "rw-aurigae",
            name: "RW Aurigae",
            ra_deg: 76,
            dec_deg: 30,
            reference_epoch_jyear: 2000,
            caveats: [],
          },
          {
            slug: "r-draconis",
            name: "R Draconis",
            ra_deg: 247,
            dec_deg: 66,
            reference_epoch_jyear: 2000,
            caveats: [],
          },
        ],
      });
    if (path === "/api/v1/bands")
      return json(route, {
        channels: Array.from({ length: 102 }, (_, i) => ({
          id: i + 1,
          detector: `D${Math.floor(i / 17) + 1}`,
          band_center_um: 0.75 + i * 0.04,
        })),
      });
    if (path === "/api/v1/releases")
      return json(route, {
        registry_version: "ui-test-registry",
        items: [
          {
            collection: "spherex_qr3",
            release: "qr3",
            psf_format: "epsf_table",
            doi: "10.26131/IRSA662",
          },
        ],
      });
    if (path === "/api/v1/releases/refresh-status")
      return json(route, {
        checks: [
          {
            report: { status: "checked", registry_version: "ui-test-registry" },
          },
        ],
      });
    if (path === "/api/v1/system/capabilities")
      return json(route, {
        movie_manifest_available: true,
        coadd_submission_available: true,
        spectrum_submission_available: true,
        difference_submission_available: true,
        gif_export_available: true,
        view_limits: { total_bytes: 268435456, wall_seconds: 180 },
      });
    if (path === "/api/v1/share/links")
      return json(route, {
        query: `v=1&ra=${body.request.region.ra}&dec=${body.request.region.dec}&width=${body.request.region.width_arcmin}&height=${body.request.region.height_arcmin}&mode=${body.mode}`,
        state: { version: "share-v1", request: body.request, mode: body.mode },
      });
    if (path === "/api/v1/share/resolve")
      return json(route, {
        state: {
          version: "share-v1",
          request: {
            ...criteria,
            region: {
              ...criteria.region,
              ra: 133.76,
              dec: -7.24,
              width_arcmin: 7,
              height_arcmin: 4,
            },
            start_at: "2026-04-01T00:00:00Z",
            end_at: "2026-04-30T23:59:59Z",
            preparation: {
              ...criteria.preparation,
              spectral_mode: "channel",
              detector: null,
              channel_id: 85,
            },
          },
          mode: "native",
        },
        automatic_submission: false,
      });
    if (path === "/api/v1/observations/search")
      return json(route, {
        snapshot_id: "00000000-0000-4000-8000-000000000900",
        sampled_count: count,
        upstream_complete: false,
        items: Array.from({ length: count }, (_, i) => ({
          id: `source-${i}`,
          provider_id: `source-${i}`,
          detector: "D6",
          release: "qr3",
          collection: "spherex_qr3",
          access_url: "https://irsa.ipac.caltech.edu/test",
          start_at_utc: `2026-04-${21 + i}T10:00:00Z`,
          end_at_utc: `2026-04-${21 + i}T10:01:00Z`,
          calibration_version: "ui-test",
          image_wavelength_min_um: 4.4,
          image_wavelength_max_um: 5,
        })),
        warnings: ["Archive sample is capped."],
        next_page: null,
        created_at_utc: "2026-11-04T00:00:00Z",
        revalidate_after_utc: "2026-11-04T00:15:00Z",
      });
    if (path === "/api/v1/comparisons/validate")
      return json(route, {
        operation: "later_minus_earlier",
        eligibility: {
          eligible: false,
          reasons: [
            "PSF_matching_not_validated",
            "quantitative_calibration_unverified",
          ],
        },
        pair_evidence: {},
        viewer_remains_available: true,
      });
    const jobPost =
      method === "POST" &&
      (path === "/api/v1/views" ||
        /\/views\/[^/]+\/(coadds|differences|spectra|exports|refresh)$/.test(
          path,
        ));
    if (jobPost) {
      if (options.quota)
        return json(route, { detail: { code: "view_quota" } }, 429);
      const kind = path === "/api/v1/views" ? "view" : path.split("/").at(-1)!;
      let id = keys.get(key || "");
      if (!id) {
        id =
          kind === "view"
            ? VIEW
            : kind === "refresh"
              ? OTHER
              : `00000000-0000-4000-8000-${String(serial++).padStart(12, "0")}`;
        keys.set(key || "", id);
        jobs.set(id, {
          kind: kind === "refresh" ? "view" : kind,
          calls: 0,
          canceled: false,
        });
      }
      if (kind === "view") request = structuredClone(body);
      if (options.loseFirstSubmission && !lost) {
        lost = true;
        await route.abort("failed");
        return;
      }
      return json(
        route,
        {
          id,
          status_url: `/api/v1/jobs/${id}`,
          result_url:
            kind === "view" || kind === "refresh"
              ? undefined
              : `/api/v1/${kind}/${id}`,
          cache_hit: false,
          cancel_token: TOKEN,
        },
        202,
      );
    }
    const id = path.split("/")[4];
    if (method === "POST" && path.endsWith("/cancel")) {
      const job = jobs.get(id);
      if (job) job.canceled = true;
      return json(route, { id, status: "canceled" });
    }
    if (/^\/api\/v1\/(jobs|views)\/[^/]+$/.test(path)) {
      const job = jobs.get(id);
      if (job) job.calls++;
      const status = job?.canceled
        ? "canceled"
        : options.hold
          ? "running"
          : job && job.calls < 2
            ? "queued"
            : "succeeded";
      return json(route, {
        id,
        status,
        attempt: 1,
        error_code: null,
        expires_at_utc: options.expire
          ? "2020-01-01T00:00:00Z"
          : "2099-01-01T00:00:00Z",
        canonical_request: request,
      });
    }
    if (path.endsWith("/manifest")) {
      if (options.expire && id === VIEW)
        return json(route, { detail: { code: "view_expired" } }, 410);
      if (options.delayFirstManifest && id === VIEW) {
        await new Promise((r) => setTimeout(r, 800));
      }
      return json(route, manifest(count, id, request));
    }
    if (path.endsWith("/frames")) {
      const mode =
        url.searchParams.get("mode") === "native" ? "native" : "common";
      const offset = Number(url.searchParams.get("offset") || 0);
      const items = Array.from({ length: count }, (_, i) => frame(i, id, mode));
      const size = 2;
      return json(route, {
        manifest_sha256: "b".repeat(64),
        total: count,
        offset,
        limit: size,
        items: items.slice(offset, offset + size),
        next_page:
          offset + size < count
            ? `/api/v1/views/${id}/frames?mode=${mode}&offset=${offset + size}`
            : null,
      });
    }
    if (path.endsWith("/coordinates"))
      return json(route, {
        ra_deg: 133.761234,
        dec_deg: -7.240123,
        frame: "ICRS",
        x: 32,
        y: 32,
        inside: true,
      });
    if (path.endsWith("/preparation"))
      return json(route, preparation(id, count));
    if (path.endsWith("/coadds/options"))
      return json(route, {
        detectors: Array.from({ length: 6 }, (_, i) => ({
          detector: `D${i + 1}`,
          availability: i === 5 ? "available" : "not_in_acquired_sample",
          input_indices: i === 5 ? [0, 1, 2] : [],
        })),
      });
    if (path.endsWith("/links"))
      return json(route, {
        query: "v=1&ra=133.76&dec=-7.24&width=5&height=5&mode=common",
        state: { version: "share-v1", request: criteria, mode: "common" },
        embed_path: `/api/v1/share/embed/${id}`,
        expires_at_utc: "2099-01-01T00:00:00Z",
        manifest_sha256: "b".repeat(64),
      });
    if (path.endsWith("/overlays/catalogs")) {
      if (overlayFailures > 0) {
        overlayFailures--;
        return json(
          route,
          { code: "provider_unavailable", status: "unavailable" },
          503,
        );
      }
      const survey =
        url.searchParams.get("survey") === "gaia" ? "Gaia DR3" : "AllWISE";
      return json(route, {
        status: "ready",
        markers: [
          {
            id: "4472831207517410816",
            survey,
            position_status:
              "linear_proper_motion_prediction_no_parallax_or_radial_velocity",
            display_position: { ra_deg: 133.76, dec_deg: -7.24 },
            catalog_fields: { ra_error: "0.1" },
            pixel: { inside: true, x_png: 25, y_png: 30 },
          },
        ],
        credits: "Controlled UI context fixture",
        truncated: true,
        retrieved_at_utc: "2026-11-04T00:00:00Z",
        warnings: [],
      });
    }
    if (/\/overlays\/wise\/[12]$/.test(path))
      return json(route, {
        band: `W${path.at(-1)}`,
        png_url:
          "/api/v1/artifacts/00000000-0000-4000-8000-000000000070/content",
        fits_url:
          "/api/v1/artifacts/00000000-0000-4000-8000-000000000071/content",
        source: { date_obs1: "2010-01-01", date_obs2: "2011-01-01" },
        credits: "WISE / NASA/IPAC",
        warnings: [],
        spatial: { shape: [64, 64] },
      });
    if (/^\/api\/v1\/(coadds|differences|spectra|exports)\//.test(path)) {
      const kind = path.split("/")[3];
      const png = { ...artifact(80), kind: "coadd_preview" };
      const fits = {
        ...artifact(81, "application/fits"),
        kind: "coadd_planes",
      };
      if (kind === "coadds")
        return json(route, {
          kind: "coadd",
          outcome: "ready",
          groups: [
            {
              indices: [0, 1],
              status: "ready",
              unit: "MJy/sr",
              artifact_indices: { preview: 0, planes: 1 },
              warnings: ["Display combination only."],
            },
          ],
          artifacts: [png, fits],
        });
      if (kind === "differences")
        return json(route, {
          kind: "difference",
          outcome: "ineligible",
          eligibility: {
            eligible: false,
            reasons: ["PSF_matching_not_validated"],
          },
          artifacts: [],
        });
      if (kind === "spectra")
        return json(route, {
          kind: "spectrum",
          outcome: "ready",
          samples: [
            {
              product_id: "spectrum-test-1",
              observed_at_utc: "2026-04-21T10:00:30Z",
              mid_mjd_utc: "61151",
              detector: "D6",
              wavelength_um: 4.5,
              bandwidth_um: 0.04,
              flux_uJy: 125,
              flux_error_uJy: 10,
              status: "diagnostic_only",
              reason: "calibration_unvalidated",
            },
            {
              product_id: "spectrum-test-2",
              observed_at_utc: "2026-04-22T10:00:30Z",
              mid_mjd_utc: "61152",
              detector: "D6",
              wavelength_um: null,
              bandwidth_um: null,
              flux_uJy: null,
              flux_error_uJy: null,
              status: "unavailable",
              reason: "masked_aperture",
            },
          ],
          artifacts: [{ ...artifact(82, "text/csv"), kind: "spectrum_csv" }],
          csv_artifact_index: 0,
        });
      return json(route, {
        kind: "export",
        outcome: "ready",
        frame_count: count,
        gif_artifact_index: 0,
        provenance_artifact_index: 1,
        artifacts: [
          { ...artifact(83, "image/gif"), kind: "movie_gif" },
          { ...artifact(84, "application/json"), kind: "export_provenance" },
        ],
      });
    }
    if (path.includes("/artifacts/"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: svg(Number(path.split("/")[4].slice(-1))),
      });
    if (path.includes("/export-metadata"))
      return json(route, {
        credits: "NASA/IPAC IRSA",
        manifest_sha256: "b".repeat(64),
      });
    return json(route, { detail: { code: "unhandled_fixture_route" } }, 404);
  });
  return { calls, jobs, keys };
}
