import { defineConfig } from "@playwright/test";

// These fixtures boot only their owned Electron capture process. The desktop
// navigation config's full agent/API web server is not needed for pixel tests.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /browser-renderer\.pw\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  outputDir: "./var/playwright/rendered-test-results",
  reporter: [["list", { printSteps: true }]],
  timeout: 60_000,
});
