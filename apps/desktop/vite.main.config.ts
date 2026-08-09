import { builtinModules } from "node:module";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    conditions: ["module", "node", "development|production"],
    mainFields: ["module", "jsnext:main", "jsnext"],
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/main/index.ts",
      formats: ["es"],
      fileName: () => "main.mjs",
    },
    outDir: "dist/main",
    rolldownOptions: {
      external: [
        "electron",
        "electron-updater",
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
      ],
      output: {
        banner:
          'import { createRequire as __doolittleCreateRequire } from "node:module";import { fileURLToPath as __doolittleFileURLToPath } from "node:url";import { dirname as __doolittleDirname } from "node:path";const require = __doolittleCreateRequire(import.meta.url);const __filename = __doolittleFileURLToPath(import.meta.url);const __dirname = __doolittleDirname(__filename);',
      },
    },
    sourcemap: process.env.DOOLITTLE_DESKTOP_SOURCEMAPS === "1",
    target: "node24",
  },
});
