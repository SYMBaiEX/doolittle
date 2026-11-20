import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import desktopPackage from "./package.json" with { type: "json" };
import { desktopBuildInventoryPlugin } from "./scripts/desktop-build-inventory.ts";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  define: {
    "import.meta.env.VITE_DOOLITTLE_DESKTOP_VERSION": JSON.stringify(
      desktopPackage.version,
    ),
    "import.meta.env.VITE_DOOLITTLE_DESKTOP_HOMEPAGE": JSON.stringify(
      desktopPackage.homepage,
    ),
  },
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
