import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.pw\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  outputDir: "./var/playwright/test-results",
  reporter: [["list", { printSteps: true }]],
  timeout: 60_000,
});
