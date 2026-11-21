import { fileURLToPath } from "node:url";
import type { BuildOptions } from "esbuild";

export const CLI_OUTPUT_DIRECTORY = fileURLToPath(
  new URL("../apps/cli/dist/", import.meta.url),
);
export const CLI_CHUNK_PATTERN = /^doolittle-[a-z0-9_-]+-[a-z0-9]{8}\.js$/iu;

export function cliBuildOptions(): BuildOptions {
  return {
    absWorkingDir: fileURLToPath(new URL("../apps/cli/", import.meta.url)),
    entryPoints: ["src/index.ts", "src/acp-server.ts"],
    bundle: true,
    splitting: true,
    chunkNames: "doolittle-[name]-[hash]",
    platform: "node",
    format: "esm",
    target: "node26",
    outdir: CLI_OUTPUT_DIRECTORY,
    external: ["sharp", "term.js", "pty.js", "@elizaos/*"],
    banner: {
      js: 'import { createRequire as __doolittleCreateRequire } from "node:module";const require = __doolittleCreateRequire(import.meta.url);',
    },
    logLevel: "info",
  };
}
