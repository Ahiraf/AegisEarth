import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

const id = "00000000-0000-4000-8000-000000000123";
function candidate(name: string, magnitude: number, faint = false) {
  return {
    id: name,
    name,
    classification: "uncertain",
    score: faint ? null : 0.8,
    score_uncertainty: faint ? null : 0.02,
    warnings: faint ? ["PREDICTED_FAINTER_THAN_TRAINING_RANGE"] : [],
    evidence: {
      v_mag: magnitude,
      n_frames_used: faint ? 0 : 6,
      warning_messages: faint
        ? [
            "Predicted brightness is outside the range this ranker was tested on.",
          ]
        : [],
      frames: [
        {
          mid_mjd: 61030,
          ra_deg: 179.8,
          dec_deg: -0.6,
          used_for_score: !faint,
          reasons: faint ? ["PREDICTED_FAINTER_THAN_TRAINING_RANGE"] : [],
        },
      ],
    },
  };
}
test("optional results show bright objects first and collapse all faint known objects", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/v1/analyses/*", (route) =>
    route.fulfill({
      json: {
        id,
        status: "succeeded",
        error_code: null,
        result: {
          method: "metadata_ranker",
          cutout_policy: "per_candidate_centered_v1",
          model: { version: "ranker_AB_v3" },
          warnings: ["CANDIDATE_LIMIT_REACHED"],
          candidates: [
            candidate("Faint object", 23, true),
            candidate("Dimmer", 17),
            candidate("Brighter", 11),
          ],
        },
      },
    }),
  );
  await page.goto("/#/explorer");
  const section = page.locator("#model");
  await section
    .getByText("Open an existing optional analysis", { exact: true })
    .click();
  await section.getByLabel("Analysis UUID").fill(id);
  await section
    .getByRole("button", { name: "Load analysis", exact: true })
    .click();
  await expect(
    section.getByRole("heading", { name: "Brighter", exact: true }),
  ).toBeVisible();
  await expect(
    section.locator('[aria-label="Bright candidate results"] h4'),
  ).toHaveText(["Brighter", "Dimmer"]);
  await expect(
    section.getByRole("heading", { name: "Faint object", exact: true }),
  ).toBeHidden();
  await expect(
    section.getByText("Candidate rank: 0.8000", { exact: true }),
  ).toHaveCount(2);
  await section
    .getByText("Known objects too faint for this ranker (1)", { exact: true })
    .click();
  await expect(
    section.getByRole("heading", { name: "Faint object", exact: true }),
  ).toBeVisible();
  await expect(section.getByText("Unscored", { exact: true })).toBeVisible();
  await expect(section.getByText(/No cutouts were downloaded/)).toBeVisible();
});

test("an optional analysis outage leaves the live viewer usable", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/v1/analyses/*", (route) =>
    route.fulfill({
      json: {
        id,
        status: "failed",
        error_code: "skybot_unavailable",
        result: null,
      },
    }),
  );
  await page.goto("/#/explorer");
  const section = page.locator("#model");
  await section
    .getByText("Open an existing optional analysis", { exact: true })
    .click();
  await section.getByLabel("Analysis UUID").fill(id);
  await section
    .getByRole("button", { name: "Load analysis", exact: true })
    .click();
  await expect(
    section.getByText(/Optional analysis failed: skybot unavailable/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare sky movie", exact: true }),
  ).toBeEnabled();
  await expect(
    section.getByRole("button", {
      name: "Rank known objects in this search",
      exact: true,
    }),
  ).toBeDisabled();
});
