import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const elizaAccountComponentPath = "/@elizaos/ui/components/accounts/";
const elizaAppStorePath = fileURLToPath(
  new URL("../../node_modules/@elizaos/ui/state/app-store.js", import.meta.url),
);
const rendererElizaControlsPath = fileURLToPath(
  new URL("./src/renderer/components/ElizaControls.tsx", import.meta.url),
);

/**
 * Eliza UI beta account components import the broad state barrel even though
 * they only consume useAppSelector. That barrel reaches Node-only services and
 * crashes an Electron renderer where `process` is intentionally unavailable.
 * Keep the components official while routing that one dependency to Eliza's
 * own browser-safe selector store. Remove once the upstream import is narrowed.
 */
function elizaAccountStoreShim(): Plugin {
  return {
    name: "doolittle-eliza-account-store",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "../../state/index.js" &&
        importer?.replaceAll("\\", "/").includes(elizaAccountComponentPath)
      ) {
        return elizaAppStorePath;
      }
      return null;
    },
  };
}

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
    elizaControlDensityAdapter(),
    elizaAccountStoreShim(),
    react(),
    tailwindcss(),
  ],
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
