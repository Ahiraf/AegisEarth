import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test("3D orbits expose all missions, camera controls and source-backed facts", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockApi(page);
  await page.goto("/#/orbits");
  const section = page.locator("#orbits");
  await section.scrollIntoViewIfNeeded();
  const model = section.getByRole("group", {
    name: "Interactive 3D satellite orbits",
  });
  await expect(model).toHaveAttribute("data-scene-status", "ready");
  await expect(model.locator("canvas")).toBeVisible();
  await section
    .getByRole("button", { name: "Pause orbits", exact: true })
    .click();
  await expect(
    section.getByRole("button", { name: "Play orbits", exact: true }),
  ).toBeVisible();
  await expect(section.locator(".fact-row")).toHaveCount(8);
  for (const [name, title] of [
    ["Hubble", "Hubble Space Telescope"],
    ["SPHEREx", "SPHEREx infrared observatory"],
    ["Galileo", "Galileo navigation satellites"],
    ["GOES", "GOES-R series weather satellites"],
    ["ISS", "International Space Station"],
  ]) {
    await section.getByRole("button", { name, exact: true }).click();
    await expect(
      section.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(section.locator("#orbit-facts h3")).toHaveText(title);
    await expect(section.locator(".fact-row")).toHaveCount(8);
    await expect(section.locator(".fact-row a")).toHaveCount(8);
  }
  const beforeDrag = await model.screenshot({ path: '../var/frontend-integration/orbits-paused.png' });
  const bounds = await model.locator("canvas").boundingBox();
  if (!bounds) throw new Error("The orbit canvas is missing");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 80, bounds.y + bounds.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await model.screenshot()).equals(beforeDrag)).toBe(false);
  const before = await model.screenshot();
  await model.focus();
  await model.press("ArrowRight");
  await expect
    .poll(async () => (await model.screenshot()).equals(before))
    .toBe(false);
  await section
    .getByRole("button", { name: "Zoom in on satellite orbits" })
    .click();
  await section
    .getByRole("button", { name: "Reset view", exact: true })
    .click();
  await model.screenshot({ path: '../var/frontend-integration/orbits-reset.png' });
  await model.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../var/frontend-integration/orbits-desktop.png",
  });
});

test("orbit animation respects a change to reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockApi(page);
  await page.goto("/#/orbits");
  const section = page.locator("#orbits");
  await section.scrollIntoViewIfNeeded();
  await expect(
    section.getByRole("button", { name: "Pause orbits", exact: true }),
  ).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    section.getByRole("button", { name: "Motion paused", exact: true }),
  ).toBeDisabled();
});

test("satellite facts remain usable when WebGL is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl") || type === "experimental-webgl")
        return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await mockApi(page);
  await page.goto("/#/orbits");
  const section = page.locator("#orbits");
  await section.scrollIntoViewIfNeeded();
  await expect(
    section.getByText(/3D is unavailable in this browser/),
  ).toBeVisible();
  await section.getByRole("button", { name: "Galileo", exact: true }).click();
  await expect(section.locator("#orbit-facts")).toContainText("23,222 km");
  await expect(section.locator("#orbit-facts")).toContainText("About 14 hours");
  await expect(
    section.getByRole("button", { name: "Zoom in on satellite orbits" }),
  ).toBeDisabled();
});

test("3D orbits fit a narrow phone screen and release the canvas on navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/#/orbits");
  const section = page.locator("#orbits");
  await section.scrollIntoViewIfNeeded();
  await expect(
    section.getByRole("group", { name: "Interactive 3D satellite orbits" }),
  ).toHaveAttribute("data-scene-status", "ready");
  await section.getByRole("button", { name: "SPHEREx", exact: true }).click();
  await expect(section.locator("#orbit-facts")).toContainText(
    "102 near-infrared",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await section.screenshot({
    path: "../var/frontend-integration/orbits-mobile.png",
  });
  await page.goto("/#/learn");
  await expect(page.locator(".orbit-canvas canvas")).toHaveCount(0);
});
