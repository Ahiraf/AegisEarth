import type {
  Acceptance,
  Frame,
  FramePage,
  Job,
  Manifest,
  References,
  ViewRequest,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "network_error",
    public retryAfter = 2,
  ) {
    super(message);
  }
}
const MESSAGES: Record<string, string> = {
  all_sources_unavailable:
    "The archive is temporarily unavailable. Your coordinates are preserved; retry the submission later.",
  source_retention_too_short_resubmit_view:
    "These source images are close to expiry. Refresh the sky view before running this operation.",
  common_grid_and_region_required:
    "Choose images prepared on the same sky grid for this operation.",
  derived_input_byte_budget:
    "This combination exceeds the input limit. Select fewer images.",
  duplicate_or_unknown_physical_exposure:
    "The same physical observation was selected more than once. Choose distinct exposures.",
  download_budget_exceeded:
    "The archive download exceeded this view’s transfer limit. Try fewer images or a smaller field.",
  source_unavailable:
    "The archive could not deliver the selected images. Try again later.",
  wall_time_exceeded:
    "Preparing this view took longer than the service allows. Try fewer source images or a smaller field of view.",
  no_wise_image_coverage: "No WISE image was returned for this patch.",
  overlay_busy: "Survey context is busy. Pause playback and retry the layer.",
  provider_unavailable: "The survey archive is temporarily unavailable.",
};
export function apiUrl(path: string): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const base = new URL(configured || location.origin, location.origin);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new ApiError("The data connection is configured incorrectly.");
  const url = new URL(path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith("/api/v1/"))
    throw new ApiError("The data service returned an unsupported link.");
  return url.href;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed. Please try again.";
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T; status: number; retryAfter: number }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const retryAfter = Math.min(
      30,
      Math.max(1, Number(response.headers.get("Retry-After")) || 2),
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const value = body as {
        detail?:
          | { code?: string; error_code?: string }
          | { msg: string; loc?: string[] }[];
      };
      const detail = value?.detail;
      const code =
        detail && !Array.isArray(detail)
          ? detail.code || detail.error_code || "request_failed"
          : "invalid_request";
      const message = Array.isArray(detail)
        ? detail
            .slice(0, 3)
            .map((e) => `${e.loc?.slice(1).join(" › ") || "Request"}: ${e.msg}`)
            .join("; ")
        : MESSAGES[code] ||
          (response.status === 410
            ? "This saved view has expired. Refresh it or submit the coordinates again."
            : response.status === 429
              ? `The processing limit has been reached. Retry in ${retryAfter} seconds.`
              : response.status === 403
                ? "This website is not allowed to perform that request."
                : response.status === 404
                  ? "The requested view or artifact could not be found."
                  : `The data service could not complete this request (${code.replaceAll("_", " ")}).`);
      throw new ApiError(message, response.status, code, retryAfter);
    }
    if (body === null)
      throw new ApiError(
        "The data service returned an unreadable response.",
        response.status,
      );
    return { data: body as T, status: response.status, retryAfter };
  } catch (error) {
    if (options.signal?.aborted)
      throw new DOMException("Request stopped", "AbortError");
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? "The data request timed out. You can retry it."
        : "Could not reach the data service. Check the connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
export const get = async <T>(path: string, signal?: AbortSignal) =>
  (await request<T>(path, { signal })).data;
export const post = async <T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  key?: string,
) =>
  (
    await request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      signal,
      headers: key ? { "Idempotency-Key": key } : {},
    })
  ).data;
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Request stopped", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function waitForJob(
  id: string,
  signal: AbortSignal,
  progress?: (job: Job) => void,
): Promise<Job> {
  const deadline = Date.now() + 16 * 60 * 1000;
  while (Date.now() < deadline) {
    const reply = await request<Job>(`/api/v1/jobs/${id}`, { signal });
    const job = reply.data;
    progress?.(job);
    if (job.status === "succeeded") return job;
    if (job.status === "canceled")
      throw new ApiError("Processing was canceled.", 409, "canceled");
    if (job.status === "failed")
      throw new ApiError(
        MESSAGES[job.error_code || ""] ||
          `Processing failed: ${(job.error_code || "unknown error").replaceAll("_", " ")}.`,
        409,
        "job_failed",
      );
    await delay(reply.retryAfter * 1000, signal);
  }
  throw new ApiError(
    "Processing is taking longer than expected. Reopen the saved view to check its status.",
  );
}
export async function submit(
  path: string,
  body: unknown,
  key: string,
  signal?: AbortSignal,
): Promise<Acceptance> {
  await get("/api/v1/views/session", signal);
  return post<Acceptance>(path, body, signal, key);
}
export async function cancel(id: string, token: string): Promise<Job> {
  return (
    await request<Job>(`/api/v1/views/${id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
  ).data;
}
export async function frames(
  manifest: Manifest,
  mode: "common" | "native",
  signal: AbortSignal,
  onPage?: (items: Frame[]) => void,
): Promise<Frame[]> {
  let next: string | null = manifest.timelines[mode].frames_url + "&limit=4";
  const visited = new Set<string>();
  const result: Frame[] = [];
  while (next) {
    if (visited.has(next) || visited.size >= 12)
      throw new ApiError(
        "The image timeline could not be read safely. Reload this view.",
      );
    visited.add(next);
    const page: FramePage = await get<FramePage>(next, signal);
    if (page.manifest_sha256 !== manifest.manifest_sha256)
      throw new ApiError(
        "The timeline changed while loading. Reload this saved view.",
      );
    result.push(...page.items);
    if (result.length > 12)
      throw new ApiError("The image timeline exceeds the supported size.");
    onPage?.([...result]);
    next = page.next_page;
  }
  return result;
}
export async function references(signal: AbortSignal): Promise<References> {
  const values = await Promise.allSettled([
    get<{ items: References["targets"] }>("/api/v1/targets", signal),
    get<{ channels: References["channels"] }>("/api/v1/bands", signal),
    get<{ items: References["releases"]; registry_version: string }>(
      "/api/v1/releases",
      signal,
    ),
    get<References["capabilities"]>("/api/v1/system/capabilities", signal),
    get<{ checks: References["refreshChecks"] }>(
      "/api/v1/releases/refresh-status",
      signal,
    ),
  ]);
  return {
    targets: values[0].status === "fulfilled" ? values[0].value.items : [],
    channels: values[1].status === "fulfilled" ? values[1].value.channels : [],
    releases: values[2].status === "fulfilled" ? values[2].value.items : [],
    registry:
      values[2].status === "fulfilled"
        ? values[2].value.registry_version
        : null,
    capabilities: values[3].status === "fulfilled" ? values[3].value : {},
    refreshChecks:
      values[4].status === "fulfilled" ? values[4].value.checks : [],
    errors: values.flatMap((v, i) =>
      v.status === "rejected"
        ? [
            `${["Targets", "Bands", "Releases", "Connection", "Refresh history"][i]}: ${errorMessage(v.reason)}`,
          ]
        : [],
    ),
  };
}
export function discoveryRequest(view: ViewRequest) {
  const {
    preparation,
    max_frames,
    selection_policy,
    contract_version,
    ...criteria
  } = view;
  const detectors =
    preparation.spectral_mode === "detector"
      ? [preparation.detector!]
      : preparation.spectral_mode === "channel"
        ? [`D${Math.ceil(preparation.channel_id! / 17)}`]
        : criteria.detectors || [];
  return {
    ...criteria,
    detectors,
    contract_version: "discovery-v1",
    limit: 20,
  };
}
