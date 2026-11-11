import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("solar model supports mesh picking, close-up texture maps, and independent routes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockApi(page);
  await page.goto("/#/solar");
  await expect(page.locator(".world-viewport")).toHaveAttribute(
    "data-scene-status",
    "ready",
  );
  await expect(page.getByTestId("object-details")).toBeVisible();
  await expect(page.locator("#object-title")).toHaveText("Earth");
  await expect(page.locator(".planet-highlight-moons strong")).toHaveText("1");
  const label = page.getByRole("button", {
    name: "Inspect Jupiter",
    exact: true,
  });
  await expect(label).toBeVisible();
  const point = await label.evaluate((el) => ({
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
  }));
  const stage = await page.locator(".world-viewport").boundingBox();
  await page.mouse.click(stage!.x + point.x, stage!.y + point.y);
  await expect(page.locator("#object-title")).toHaveText("Jupiter");
  await expect(page.locator(".planet-highlight-moons strong")).toHaveText(
    "115",
  );
  await page.getByRole("button", { name: "Take a closer look" }).click();
  await expect(page.locator(".world-render canvas")).toHaveAttribute(
    "data-focused",
    "true",
  );
  await expect(page.locator(".world-render canvas")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          performance
            .getEntriesByType("resource")
            .filter((r) => r.name.includes("/textures/")).length,
      ),
    )
    .toBeGreaterThanOrEqual(11);
  await page.screenshot({
    path: "../var/frontend-integration/world-solar-jupiter.png",
  });
  for (const name of [
    "Mercury",
    "Venus",
    "Earth",
    "Mars",
    "Saturn",
    "Uranus",
    "Neptune",
  ]) {
    await page.getByLabel("Explore an object").selectOption({ label: name });
    await expect(page.locator("#object-title")).toHaveText(name);
    await expect(
      page.getByTestId("object-details").locator(".fact-row"),
    ).toHaveCount(4);
  }
  await page.getByLabel("Explore an object").selectOption({ label: "Saturn" });
  await expect(page.locator(".planet-highlight-moons strong")).toHaveText(
    "293",
  );
  await expect(page.locator(".world-render canvas")).toHaveAttribute(
    "data-selected",
    "5",
  );
  await expect(page.locator(".world-render canvas")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await page.screenshot({
    path: "../var/frontend-integration/world-solar-saturn.png",
  });
  await page.getByRole("button", { name: "Close object details" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.locator(".world-render canvas")).toHaveAttribute(
    "data-focused",
    "false",
  );
  await expect(page.locator(".world-render canvas")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await page.screenshot({
    path: "../var/frontend-integration/world-solar.png",
  });
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await page
      .getByRole("button", { name: "Enter full screen", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Exit full screen", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement?.id)).toBe(
      "solar",
    );
    await page
      .getByRole("button", { name: "Exit full screen", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Enter full screen", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("link", { name: "Explorer", exact: true })
    .first()
    .click();
  await expect(page.locator("#hero-title")).toBeVisible();
  await expect(page.locator("#solar, #orbits, #atmosphere")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("altitude explorer crosses all layer boundaries and retains independent learning details", async ({
  page,
}) => {
  await page.goto("/#/atmosphere");
  await expect(page.locator(".world-viewport")).toHaveAttribute(
    "data-scene-status",
    "ready",
  );
  const numeric = page.getByLabel("Go to altitude (km)");
  for (const [altitude, layer] of [
    ["0", "Troposphere"],
    ["12", "Stratosphere"],
    ["50", "Mesosphere"],
    ["80", "Thermosphere"],
    ["100", "Thermosphere"],
    ["700", "Exosphere"],
    ["10000", "Exosphere"],
  ]) {
    await numeric.fill(altitude);
    await expect(page.locator("#object-title")).toHaveText(layer);
    await expect(
      page.getByRole("slider", { name: "Your altitude" }),
    ).toHaveAttribute("aria-valuetext", new RegExp(layer));
  }
  await page.getByRole("slider").fill("0");
  await expect(numeric).toHaveValue("0");
  await expect(page.locator("#object-title")).toHaveText("Troposphere");
  await page.getByRole("button", { name: "Thermosphere", exact: true }).click();
  await expect(numeric).toHaveValue("420");
  await expect(page.getByText(/conventional Kármán line/)).toBeVisible();
  await page.screenshot({
    path: "../var/frontend-integration/world-atmosphere.png",
  });
  await page.getByRole("button", { name: "Close object details" }).click();
  await expect(page.getByTestId("object-details")).toHaveCount(0);
  await page.getByLabel("Explore a layer").selectOption({ label: "Exosphere" });
  await expect(page.locator("#object-title")).toHaveText("Exosphere");
});

test("atmosphere works on a phone and survives context loss with facts available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/atmosphere");
  await expect(page.locator(".world-viewport")).toHaveAttribute(
    "data-scene-status",
    "ready",
  );
  expect((await page.locator(".world-viewport").boundingBox())!.width).toBe(
    390,
  );
  await page.getByLabel("Go to altitude (km)").fill("65");
  await expect(page.locator("#object-title")).toHaveText("Mesosphere");
  await page.screenshot({
    path: "../var/frontend-integration/world-atmosphere-phone.png",
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .locator(".world-render canvas")
    .evaluate((el) =>
      el.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(page.locator(".world-viewport")).toHaveAttribute(
    "data-scene-status",
    "unavailable",
  );
  await page
    .getByLabel("Explore a layer")
    .selectOption({ label: "Stratosphere" });
  await expect(page.locator("#object-title")).toHaveText("Stratosphere");
});

for (const [route, objectName] of [
  ["orbits", "ISS"],
  ["solar", "Jupiter"],
  ["atmosphere", "Exosphere"],
]) {
  test(`${route} zooms in and out with the mouse wheel without Ctrl`, async ({
    page,
  }) => {
    await page.goto(`/#/${route}`);
    const viewport = page.locator(".world-viewport");
    const canvas = viewport.locator("canvas");
    await expect(viewport).toHaveAttribute("data-scene-status", "ready");
    const close = page.getByRole("button", { name: "Close object details" });
    if (await close.count()) await close.click();
    await expect(canvas).toHaveAttribute("data-selected", "");
    await expect(canvas).toHaveAttribute("data-settled", "true");
    const bounds = (await viewport.boundingBox())!;
    // The directory offsets the camera's optical centre, so a label's distance
    // from the *browser viewport centre* can decrease even when zooming in.
    // Measure the actual camera distance instead of that incorrect proxy.
    const distance = () =>
      canvas.evaluate((element) => Number(element.dataset.cameraDistance));
    const before = await distance();
    expect(
      before,
      `${objectName} camera distance must be positive`,
    ).toBeGreaterThan(0);
    await page.mouse.move(
      bounds.x + bounds.width * 0.7,
      bounds.y + bounds.height * 0.65,
    );
    await page.mouse.wheel(0, -240);
    await expect.poll(distance).toBeLessThan(before * 0.95);
    await expect(canvas).toHaveAttribute("data-settled", "true");
    const zoomedIn = await distance();
    await page.mouse.wheel(0, 240);
    await expect.poll(distance).toBeGreaterThan(zoomedIn * 1.05);
    await expect(canvas).toHaveAttribute("data-settled", "true");
    expect(await page.evaluate(() => scrollY)).toBe(0);
    if (route === "orbits") {
      await page.getByLabel("Explore an object").selectOption({ label: "ISS" });
      await expect(canvas).toHaveAttribute("data-selected", "0");
      await expect(canvas).toHaveAttribute("data-settled", "true");
      const panel = page.getByTestId("object-details");
      const still = await distance();
      await panel.hover();
      await page.mouse.wheel(0, 360);
      await expect
        .poll(() => panel.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      expect(await distance()).toBeCloseTo(still, 2);
    }
  });
}
