import { fileURLToPath } from "node:url";
import type { BuildOptions } from "esbuild";

export function cliBuildOptions(): BuildOptions {
  return {
    absWorkingDir: fileURLToPath(new URL("../apps/cli/", import.meta.url)),
    entryPoints: ["src/index.ts", "src/acp-server.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node26",
    outdir: "dist",
    external: ["sharp", "term.js", "pty.js", "@elizaos/*"],
    banner: {
      js: 'import { createRequire as __doolittleCreateRequire } from "node:module";const require = __doolittleCreateRequire(import.meta.url);',
    },
    logLevel: "info",
  };
}
