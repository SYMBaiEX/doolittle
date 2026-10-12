import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["tests/integration/runtime.e2e.test.ts"],
    maxWorkers: 1,
  },
});
