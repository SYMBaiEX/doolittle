import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { desktopBuildInventoryPlugin } from "./scripts/desktop-build-inventory.ts";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [desktopBuildInventoryPlugin({ surface: "preload", desktopRoot })],
  resolve: {
    conditions: ["module", "node", "development|production"],
    mainFields: ["module", "jsnext:main", "jsnext"],
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/preload/index.ts",
      formats: ["cjs"],
      fileName: () => "preload.cjs",
    },
    outDir: "dist/preload",
    rolldownOptions: {
      external: [
        "electron",
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
      ],
    },
    sourcemap: process.env.DOOLITTLE_DESKTOP_SOURCEMAPS === "1",
    target: "node24",
  },
});
