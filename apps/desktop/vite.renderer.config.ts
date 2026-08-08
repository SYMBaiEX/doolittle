import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const elizaAccountComponentPath = "/@elizaos/ui/components/accounts/";
const elizaAppStorePath = fileURLToPath(
  new URL("../../node_modules/@elizaos/ui/state/app-store.js", import.meta.url),
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

export default defineConfig({
  plugins: [elizaAccountStoreShim(), react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
