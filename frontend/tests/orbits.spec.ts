import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test("orbits has its own full viewport, selectable missions, and source-backed drawers", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = await mockApi(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/orbits");
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  const model = page.getByRole("group", {
    name: "Interactive 3D satellite orbits",
  });
  await expect(model).toHaveAttribute("data-scene-status", "ready");
  await expect(
    page.getByRole("heading", {
      name: "Satellites & space stations",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("object-details")).toBeVisible();
  await expect(page.locator("#object-title")).toHaveText(
    "SPHEREx infrared observatory",
  );
  await expect(page.getByText("≈ 98 minutes")).toBeVisible();
  await expect(page.getByText("≈ 6 months")).toBeVisible();
  await page.getByRole("button", { name: "Compare galaxy images across two dates" }).click();
  const comparison = page.getByRole("dialog");
  const firstImage = await comparison.getByRole("img").getAttribute("src");
  await comparison.getByRole("button", { name: "23 May 2026" }).click();
  await expect(comparison.getByRole("img")).not.toHaveAttribute("src", firstImage!);
  await page.keyboard.press("Escape");
  await expect(comparison).toBeHidden();
  await page.getByRole("button", { name: "Hide mission directory" }).click();
  await page.getByRole("button", { name: "Hide spacecraft profile" }).click();
  await expect(page.getByTestId("object-details")).toBeHidden();
  await page.getByRole("button", { name: "Show spacecraft profile" }).click();
  await expect(page.locator("#object-title")).toHaveText("SPHEREx infrared observatory");
  await page.getByRole("button", { name: "Show mission directory" }).click();
  await expect(page.locator("#solar, #atmosphere, #hero-title")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Orbits", exact: true }).first(),
  ).toHaveAttribute("aria-current", "page");
  const bounds = await model.boundingBox();
  expect(bounds!.height).toBeGreaterThan(800);
  expect(bounds!.width).toBe(1440);
  await expect(
    page.getByRole("button", { name: "Play animation", exact: true }),
  ).toBeVisible();
  for (const [name, title] of [
    ["Hubble", "Hubble Space Telescope"],
    ["SPHEREx", "SPHEREx infrared observatory"],
    ["Galileo", "Galileo navigation satellites"],
    ["GOES", "GOES-R series weather satellites"],
    ["ISS", "International Space Station"],
  ]) {
    await page.getByLabel("Explore an object").selectOption({ label: name });
    await expect(page.locator("#object-title")).toHaveText(title);
    await expect(
      page.getByTestId("object-details").locator(".fact-row a"),
    ).toHaveCount(0);
    const credits = page.getByTestId("object-details").locator("details").filter({ hasText: "Sources & credits" });
    await credits.locator("summary").click();
    const hrefs = await credits.locator("a").evaluateAll(links => links.map(a => a.href));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  }
  await page.getByRole("button", { name: "Zoom to spacecraft in 3D" }).click();
  await page.screenshot({
    path: "../var/frontend-integration/world-orbits.png",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("object-details")).toHaveCount(0);
  await expect(page.getByLabel("Explore an object")).toBeFocused();
  await model.focus();
  await model.press("ArrowLeft");
  await model.press("+");
  await model.press("Home");
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  expect(api.calls).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("all mission facts remain accessible without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: any[]
    ) {
      if (/webgl/i.test(type)) return null;
      return original.call(this, type, ...args);
    } as typeof original;
  });
  await page.goto("/#/orbits");
  await expect(
    page.getByText("3D is unavailable in this browser", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Explore an object").selectOption({ label: "SPHEREx" });
  await expect(page.locator("#object-title")).toHaveText(
    "SPHEREx infrared observatory",
  );
  await expect(
    page.getByTestId("object-details").locator(".fact-row"),
  ).toHaveCount(8);
});

test("phone orbit page fits the viewport and releases its canvas when changing pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/#/orbits");
  await expect(page.locator(".world-viewport")).toHaveAttribute(
    "data-scene-status",
    "ready",
  );
  await page.getByLabel("Explore an object").selectOption({ label: "ISS" });
  await expect(page.getByTestId("object-details")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const panel = await page.getByTestId("object-details").boundingBox();
  expect(panel!.y).toBeGreaterThan(400);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
  expect((await page.locator(".world-viewport").boundingBox())!.width).toBe(
    390,
  );
  await page.screenshot({
    path: "../var/frontend-integration/world-orbits-phone.png",
  });
  await page.getByRole("link", { name: "Learn", exact: true }).first().click();
  await expect(page.locator(".world-page, .world-render canvas")).toHaveCount(
    0,
  );
  await page.goBack();
  await expect(page.locator(".world-viewport")).toHaveAttribute(
    "data-scene-status",
    "ready",
  );
});
