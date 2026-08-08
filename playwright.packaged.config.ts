import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "desktop-packaged.pw.ts",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    browserName: "chromium",
  },
  reporter: "list",
});
