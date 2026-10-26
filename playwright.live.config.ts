import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "live-coding.pw.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "./var/playwright/live-coding",
  reporter: [["list"]],
  timeout: 360_000,
  forbidOnly: true,
  // Linked account UI/runtime data must never enter traces or screenshots.
  use: { trace: "off", screenshot: "off", video: "off" },
});
