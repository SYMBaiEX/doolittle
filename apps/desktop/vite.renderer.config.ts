import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { desktopBuildInventoryPlugin } from "./scripts/desktop-build-inventory.ts";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    desktopBuildInventoryPlugin({ surface: "renderer", desktopRoot }),
    react(),
    tailwindcss(),
  ],
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
