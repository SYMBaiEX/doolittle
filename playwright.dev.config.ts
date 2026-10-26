import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "desktop-dev.pw.ts",
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 240_000,
  outputDir: "./var/playwright/desktop-dev",
  reporter: [["list"]],
  forbidOnly: true,
  use: { trace: "off", screenshot: "off", video: "off" },
});
