import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "desktop-packaged-smoke.pw.ts",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  outputDir: "./var/playwright/desktop-packaged",
  use: {
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
