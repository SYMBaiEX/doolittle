import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "desktop-core.pw.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "./var/playwright/desktop-core",
  reporter: [["list", { printSteps: true }]],
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
