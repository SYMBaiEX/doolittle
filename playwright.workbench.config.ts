import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /desktop-(?:session-workbench|navigation)\.pw\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "./var/playwright/workbench-test-results",
  reporter: [["list", { printSteps: true }]],
  timeout: 60_000,
});
