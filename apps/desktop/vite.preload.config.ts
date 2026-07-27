import { builtinModules } from "node:module";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/preload/index.ts",
      formats: ["cjs"],
      fileName: () => "preload.cjs",
    },
    outDir: "dist/preload",
    rollupOptions: {
      external: [
        "electron",
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
      ],
    },
    sourcemap: true,
  },
});
