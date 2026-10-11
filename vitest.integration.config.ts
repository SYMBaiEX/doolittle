import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["apps/**/*.e2e.test.ts", "packages/**/integration.test.ts"],
    // Existing suites retain their explicit environment opt-ins. A skipped
    // integration run is not evidence of worker or Docker behavior.
    maxWorkers: 2,
  },
});
