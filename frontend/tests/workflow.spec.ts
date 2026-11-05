import { test, expect, type Page } from "@playwright/test";
import { mockApi } from "./mockApi";
import { criteria, OTHER, TOKEN, VIEW } from "./fixtures";

async function prepare(page: Page) {
  await page
    .getByRole("button", { name: "Prepare sky movie", exact: true })
    .click();
  await expect(page.locator("#movie")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
}
async function sources(page: Page) {
  await page.locator("#processing").scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "Select all sources", exact: true })
    .click();
}

test("moves to movie progress before a new request is accepted", async ({
  page,
}) => {
  await mockApi(page);
  let acceptRequest!: () => void;
  const pending = new Promise<void>((resolve) => {
    acceptRequest = resolve;
  });
  await page.route("**/api/v1/views", async (route) => {
    await pending;
    await route.fallback();
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Prepare sky movie", exact: true })
    .click();
  const progress = page.getByRole("region", { name: "Sky movie progress" });
  try {
    await expect(progress).toBeInViewport();
    await expect(progress).toBeFocused();
    await expect(progress.getByRole("status")).toContainText(
      "Finding observations",
    );
    await expect(progress.getByTestId("view-id")).toHaveCount(0);
  } finally {
    acceptRequest();
  }
  await expect(progress.getByRole("status")).toContainText(
    "frames are ready below",
  );
  await expect(page.locator("#movie")).toBeVisible();
});

test("restores a timed-out view's request for editing without resubmitting it", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.route(`**/api/v1/jobs/${VIEW}`, (route) =>
    route.fulfill({
      json: {
        id: VIEW,
        status: "failed",
        attempt: 1,
        error_code: "wall_time_exceeded",
        canonical_request: {
          ...criteria,
          region: {
            ra_deg: 133.76,
            dec_deg: -7.24,
            width_arcmin: 8,
            height_arcmin: 6,
          },
          max_frames: 6,
        },
      },
    }),
  );
  await page.goto(`/?view=${VIEW}`);
  await expect(page.getByRole("alert")).toContainText(
    "Try fewer source images",
  );
  await expect(
    page.getByRole("button", { name: "Reload saved view" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit request and retry" }).click();
  await expect(page.locator("#search-ra")).toBeFocused();
  await expect(page.locator("#search-ra")).toHaveValue("133.76");
  await expect(page.getByLabel(/Maximum source images/)).toHaveValue("6");
  expect(
    api.calls.some(
      (call) => call.method === "POST" && call.path === "/api/v1/views",
    ),
  ).toBe(false);
});

test("shows request limits and serves all five dated previews independently of the API", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText(/49 × 49 pixel comparison grid/)).toContainText(
    "256 MiB",
  );

  await page.route("**/api/v1/**", (route) => route.abort());
  await page.reload();
  const summary = page.getByText(
    "Archived previews for the five challenge targets",
    { exact: true },
  );
  await summary.focus();
  await summary.press("Enter");
  const previews = page.getByRole("link", { name: /contact sheet$/ });
  await expect(previews).toHaveCount(5);
  for (const preview of await previews.all()) {
    await expect(preview).toBeVisible();
    const path = await preview.getAttribute("href");
    expect(path).toMatch(/archived-targets\/2026-11-01\/.+\.png$/);
    const response = await page.request.get(path!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});

test("preserves the existing theme and delivers a chronological paginated movie", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = await mockApi(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "WISE 0855", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(9, 21, 34)");
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("DM Sans");
  expect(
    await page
      .locator("#hero-title")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Sora");
  await prepare(page);
  await expect(page.locator("#movie .sky-date").first()).toContainText(
    "2026-04-21",
  );
  expect(api.calls.filter((c) => c.path.includes("/analyses"))).toHaveLength(0);
  const accepted = api.calls.find(
    (c) => c.method === "POST" && c.path === "/api/v1/views",
  )!;
  expect(accepted.body.contract_version).toBe("view-v2");
  expect(accepted.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(
    api.calls.findIndex((c) => c.path === "/api/v1/views/session"),
  ).toBeLessThan(api.calls.indexOf(accepted));
  expect(
    api.calls.filter((c) => c.path.endsWith("/frames")).length,
  ).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Next frame", exact: true }).click();
  await expect(page.locator("#movie .sky-date").first()).toContainText(
    "2026-04-22",
  );
  const player = page.getByRole("region", { name: "Sky movie player" });
  await player.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#movie .sky-date").first()).toContainText(
    "2026-04-23",
  );
  await page.getByLabel("Display", { exact: true }).selectOption("side");
  await expect(page.locator("#movie .sky-image-card")).toHaveCount(2);
  await page.getByLabel("Display", { exact: true }).selectOption("blink");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator("#movie")).toContainText("Reduced motion");
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "../var/frontend-integration/contract-movie-desktop.png",
    animations: "disabled",
    fullPage: false,
  });
});

test("restores all coordinate settings without creating a job and creates frontend-owned share links", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/?v=1&ra=133.76&dec=-7.24&width=7&height=4");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Shared coordinates and options restored" }),
  ).toBeVisible();
  await expect(page.locator("#search-ra")).toHaveValue("133.76");
  await expect(
    page.getByLabel("Field width (arcmin)", { exact: true }),
  ).toHaveValue("7");
  await expect(page.getByLabel("Nominal channel", { exact: true })).toHaveValue(
    "85",
  );
  expect(
    api.calls.filter((c) => c.method === "POST" && c.path === "/api/v1/views"),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Share these coordinates", exact: true })
    .click();
  const link = await page
    .getByLabel("Coordinate link", { exact: true })
    .inputValue();
  expect(new URL(link).origin).toBe("http://127.0.0.1:15175");
  expect(link).not.toContain(TOKEN);
  const state = api.calls.find((c) => c.path === "/api/v1/share/links")!.body;
  expect(state.mode).toBe("native");
  expect(state.request.preparation.channel_id).toBe(85);
});

test("isolates overlay outages, maps real API pixel coordinates, and handles source provenance", async ({
  page,
}) => {
  const api = await mockApi(page, { overlayFailure: true });
  await page.goto("/");
  await prepare(page);
  await page
    .getByText("Survey context · Gaia and WISE", { exact: true })
    .click();
  await page.getByLabel("Gaia DR3 markers", { exact: false }).check();
  await expect(
    page.getByRole("button", { name: "Retry survey context" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Retry survey context" }).click();
  await expect(page.locator(".sky-marker-map circle").first()).toBeVisible();
  await page.getByLabel("AllWISE markers", { exact: false }).check();
  await page.getByLabel("WISE image", { exact: true }).selectOption("2");
  await expect(page.locator(".sky-context-image")).toHaveJSProperty(
    "naturalWidth",
    64,
  );
  await expect(page.locator("#movie")).toContainText(
    "2010-01-01 to 2011-01-01",
  );
  await page
    .locator(".sky-image-plane")
    .click({ position: { x: 200, y: 200 } });
  await expect(page.locator(".sky-position")).toContainText("133.76123400");
  expect(api.calls.find((c) => c.path.endsWith("/coordinates"))).toBeTruthy();
  await page
    .getByText("Calibration, contamination flags and provenance", {
      exact: true,
    })
    .click();
  await expect(page.locator(".sky-json").first()).toContainText(
    "usable_fraction",
  );
  await expect(
    page.getByRole("link", { name: "Download FITS planes" }),
  ).toHaveAttribute("href", /\/api\/v1\/artifacts\//);
});

test("submits correct preparation refs for coadds, spectra, gated differences and GIF export", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/");
  await prepare(page);
  await sources(page);
  await page
    .getByRole("button", { name: "Build composite", exact: true })
    .click();
  const coadd = page.getByRole("article", { name: "Detector composite job" });
  await expect(
    coadd.getByRole("link", { name: "Full result and provenance JSON" }),
  ).toBeVisible();
  const request = api.calls.find(
    (c) => c.path.endsWith("/coadds") && c.method === "POST",
  )!.body;
  expect(request.inputs).toEqual(
    [0, 1, 2].map((index) => ({ view_id: VIEW, index })),
  );
  await expect(coadd.locator("img")).toBeVisible();
  await page
    .getByRole("button", { name: "Diagnostic spectra", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Extract diagnostic spectrum", exact: true })
    .click();
  const spectrum = page.getByRole("article", {
    name: "Diagnostic spectrum job",
  });
  await expect(
    spectrum.getByRole("link", { name: "Full result and provenance JSON" }),
  ).toBeVisible();
  await expect(spectrum).toContainText("diagnostic only");
  await expect(spectrum).toContainText("masked aperture");
  await expect(spectrum.locator("svg")).toBeVisible();
  await page
    .getByRole("button", { name: "Signed difference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear sources", exact: true })
    .click();
  await page.locator(".sky-source-list input").nth(0).check();
  await page.locator(".sky-source-list input").nth(1).check();
  await page
    .getByRole("button", { name: "Check pair eligibility", exact: true })
    .click();
  await expect(page.locator("#processing")).toContainText("Pair blocked");
  await page
    .getByRole("button", { name: "Request signed difference", exact: true })
    .click();
  const difference = page.getByRole("article", {
    name: "Signed difference job",
  });
  await expect(difference).toContainText(
    "not eligible for scientific subtraction",
  );
  await expect(difference.locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Movie export", exact: true }).click();
  await page
    .getByRole("button", { name: "Create GIF export", exact: true })
    .click();
  const movie = page.getByRole("article", { name: "Movie export job" });
  await expect(
    movie.getByRole("link", { name: "Download export provenance · 1 KB" }),
  ).toBeVisible();
  await expect(
    movie.getByRole("link", { name: "Full result and provenance JSON" }),
  ).toBeVisible();
  expect(
    api.calls.filter(
      (c) => c.method === "POST" && c.path.includes("/analyses"),
    ),
  ).toHaveLength(0);
});

test("supports additional detector views and complete moving-source epoch positions", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/");
  await prepare(page);
  await sources(page);
  await page
    .getByText("Add source observations from another prepared view", {
      exact: true,
    })
    .click();
  await page
    .getByLabel("Additional prepared view ID", { exact: true })
    .fill(OTHER);
  await page
    .getByRole("button", { name: "Add view sources", exact: true })
    .click();
  await expect(page.locator(".sky-source-list input")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Select all sources", exact: true })
    .click();
  await page
    .getByLabel("Composite detector", { exact: true })
    .selectOption("D1");
  await page
    .getByRole("button", { name: "Build composite", exact: true })
    .click();
  await expect(
    page
      .getByRole("article", { name: "Detector composite job" })
      .getByRole("link", { name: "Full result and provenance JSON" }),
  ).toBeVisible();
  expect(
    api.calls
      .find((c) => c.path.endsWith("/coadds") && c.method === "POST")!
      .body.inputs.filter((r: any) => r.view_id === OTHER),
  ).toHaveLength(3);
  await page
    .getByRole("button", { name: "Diagnostic spectra", exact: true })
    .click();
  await page
    .getByLabel("Use explicit positions for a moving source at each epoch", {
      exact: true,
    })
    .check();
  const ra = page.getByLabel(/^RA for source/),
    dec = page.getByLabel(/^Dec for source/);
  await expect(ra).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    await ra.nth(i).fill(String(133.76 + i * 0.0001));
    await dec.nth(i).fill("-7.24");
  }
  await page
    .getByRole("button", { name: "Extract diagnostic spectrum", exact: true })
    .click();
  await expect(
    page
      .getByRole("article", { name: "Diagnostic spectrum job" })
      .getByRole("link", { name: "Full result and provenance JSON" }),
  ).toBeVisible();
  const body = api.calls.find(
    (c) => c.path.endsWith("/spectra") && c.method === "POST",
  )!.body;
  expect(body.position).toBeUndefined();
  expect(body.epoch_positions).toHaveLength(6);
  expect(body.epoch_positions.map((r: any) => r.view_id)).toContain(OTHER);
});

test("reuses a submission key after a lost response and keeps capabilities out of URLs and storage", async ({
  page,
}) => {
  const api = await mockApi(page, { loseFirstSubmission: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Prepare sky movie", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry submission", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry submission", exact: true })
    .click();
  await expect(page.locator("#movie")).toBeVisible();
  const submissions = api.calls.filter(
    (c) => c.path === "/api/v1/views" && c.method === "POST",
  );
  expect(submissions).toHaveLength(2);
  expect(submissions[0].key).toBe(submissions[1].key);
  expect(submissions[0].body).toEqual(submissions[1].body);
  expect(api.keys.size).toBe(1);
  expect(page.url()).not.toContain(TOKEN);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    TOKEN,
  );
});

test("cancels an owned queued view without requiring a trained model", async ({
  page,
}) => {
  const api = await mockApi(page, { hold: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Prepare sky movie", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel view processing", exact: true })
    .click();
  await expect(page.locator(".sky-view-status")).toContainText(
    "Processing was canceled",
  );
  expect(api.calls.find((c) => c.path.endsWith("/cancel"))!.authorization).toBe(
    `Bearer ${TOKEN}`,
  );
  expect(api.calls.filter((c) => c.path.includes("/analyses"))).toHaveLength(0);
});

test("keeps a one-epoch view static and provides an explicit expired-view refresh", async ({
  page,
}) => {
  await mockApi(page, { count: 1 });
  await page.goto("/?view=" + VIEW);
  await expect(page.locator("#movie .sky-date")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/v1/**");
  const api = await mockApi(page, { expire: true });
  await page.goto("/?view=" + VIEW);
  await expect(page.locator(".sky-view-status")).toContainText("expired");
  await page
    .getByRole("button", { name: "Check latest data & rebuild", exact: true })
    .click();
  await expect(page.getByTestId("view-id")).toContainText(OTHER);
  await expect(page.locator("#movie")).toBeVisible();
  expect(
    api.calls.filter((c) => c.path === `/api/v1/views/${VIEW}/refresh`),
  ).toHaveLength(1);
});

test("shows empty coverage and quota errors without silently switching to saved data", async ({
  page,
}) => {
  await mockApi(page, { count: 0 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Prepare sky movie", exact: true })
    .click();
  await expect(page.locator("#movie")).toContainText(
    "No images in this timeline",
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/**");
  await mockApi(page, { quota: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Prepare sky movie", exact: true })
    .click();
  await expect(page.locator(".state-error")).toContainText("processing limit");
  await expect(
    page.locator(".chip").filter({ hasText: "SAVED IRSA RECORDS" }),
  ).toHaveCount(0);
});

test("keeps late results from replacing a newly opened view and isolates optional Aladin failure", async ({
  page,
}) => {
  await mockApi(page, { delayFirstManifest: true });
  await page.goto("/?view=" + VIEW);
  await page.getByText("Open a saved view", { exact: true }).click();
  await page.getByLabel("Saved view ID", { exact: true }).fill(OTHER);
  await page
    .getByRole("button", { name: "Open saved view", exact: true })
    .click();
  await expect(page.getByTestId("view-id")).toContainText(OTHER);
  await expect(page.locator("#movie")).toBeVisible();
  await expect(page.getByTestId("view-id")).toContainText(OTHER);
  await page.route("**/*aladin*", (route) => route.abort("failed"));
  await page
    .getByText("Optional sky map · Aladin Lite / CDS", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load current frame in Aladin", exact: true })
    .click();
  await expect(page.locator(".sky-aladin")).toContainText(
    "Sky map unavailable",
    { timeout: 35000 },
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
});

test("fits the mobile viewport and preserves the explicitly selected saved-record explorer", async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await prepare(page);
  await page.locator("#movie").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "../var/frontend-integration/contract-mobile.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Browse saved archive records", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open live sky viewer", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Find observations", exact: true })
    .click();
  await expect(page.locator("#results")).toContainText("IRSA archive");
  const previews = page.locator("#compare .viewer-img");
  await expect(previews).toHaveCount(2);
  await expect(previews.first()).toHaveJSProperty("naturalWidth", 49);
  await expect(previews.last()).toHaveJSProperty("naturalWidth", 49);
  await expect(
    page
      .locator("#compare")
      .getByRole("link", { name: /Original FITS product in IRSA/ }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Open live sky viewer", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Prepare sky movie", exact: true }),
  ).toBeVisible();
});
