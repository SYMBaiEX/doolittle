import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { desktopBuildInventoryPlugin } from "./scripts/desktop-build-inventory.ts";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));

const rendererElizaControlsPath = fileURLToPath(
  new URL("./src/renderer/components/ElizaControls.tsx", import.meta.url),
);

/**
 * Keep renderer imports on the official component paths while adapting their
 * default desktop density in one local boundary. The adapter imports the
 * published `.js` entries, so this exact-path redirect cannot recurse.
 */
function elizaControlDensityAdapter(): Plugin {
  return {
    name: "doolittle-eliza-control-density-adapter",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        importer?.replaceAll("\\", "/").includes("/src/renderer/") &&
        !importer.endsWith("/components/ElizaControls.tsx") &&
        [
          "@elizaos/ui/components/ui/button",
          "@elizaos/ui/components/ui/input",
          "@elizaos/ui/components/ui/textarea",
          "@elizaos/ui/components/ui/select",
        ].includes(source)
      ) {
        return rendererElizaControlsPath;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    desktopBuildInventoryPlugin({ surface: "renderer", desktopRoot }),
    elizaControlDensityAdapter(),
    react(),
    tailwindcss(),
  ],
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
