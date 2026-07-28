import { builtinModules } from "node:module";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/main/index.ts",
      formats: ["cjs"],
      fileName: () => "main.cjs",
    },
    outDir: "dist/main",
    rollupOptions: {
      external: [
        "electron",
        "electron-updater",
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
      ],
    },
    sourcemap: true,
  },
});
