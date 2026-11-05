import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
export default defineConfig({
  testDir: "./tests",
  testMatch: "workflow.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 30000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "../var/frontend-integration/playwright.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:15175",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (process.platform === "win32" && existsSync(systemChrome)
          ? systemChrome
          : undefined),
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  outputDir: "../var/frontend-integration/test-results",
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 15175 --strictPort",
    url: "http://127.0.0.1:15175",
    reuseExistingServer: !process.env.CI,
    timeout: 90000,
  },
});
