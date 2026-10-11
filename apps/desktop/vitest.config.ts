import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "../../vitest.config.ts";

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  test: {
    ...base.test,
    include: ["apps/desktop/**/*.{test,spec}.{ts,tsx}"],
  },
});
