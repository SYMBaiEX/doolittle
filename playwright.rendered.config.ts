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
  reporter: [
    ["list", { printSteps: true }],
    // The list reporter does not persist attached PNG/JSON bodies on passing
    // tests. Retain only this owned offline fixture's synthetic evidence.
    [
      "html",
      { open: "never", outputFolder: "./var/playwright/rendered-report" },
    ],
  ],
  timeout: 60_000,
});
