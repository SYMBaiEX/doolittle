import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const outputDir = resolve(desktopRoot, "build", "runtime");
const outputPath = resolve(outputDir, "doolittle-runtime.mjs");
const pgliteDist = resolve(
  repoRoot,
  "node_modules",
  "@electric-sql",
  "pglite",
  "dist",
);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const pgliteAssets = readdirSync(pgliteDist)
  .filter(
    (fileName) =>
      fileName.endsWith(".tar.gz") ||
      fileName.endsWith(".wasm") ||
      fileName === "pglite.data",
  )
  .sort();

for (const fileName of pgliteAssets) {
  copyFileSync(resolve(pgliteDist, fileName), resolve(outputDir, fileName));
}

const pgliteBundlePaths: Plugin = {
  name: "pglite-bundle-paths",
  setup(esbuild) {
    esbuild.onLoad(
      { filter: /@electric-sql[\\/]pglite[\\/]dist[\\/].*\.js$/ },
      ({ path }) => ({
        contents: readFileSync(path, "utf8").replaceAll(
          /new URL\("\.\.\/([^"]+\.tar\.gz)",import\.meta\.url\)/g,
          'new URL("./$1",import.meta.url)',
        ),
        loader: "js",
      }),
    );
  },
};

console.log(
  `Bundling the Doolittle runtime for Electron's embedded Node (${pgliteAssets.length} database assets)…`,
);

await build({
  absWorkingDir: repoRoot,
  entryPoints: [resolve(repoRoot, "packages", "agent", "src", "index.ts")],
  outfile: outputPath,
  bundle: true,
  platform: "node",
  format: "esm",
  // Electron 43 embeds Node 24. Keep the packaged runtime syntax compatible
  // with the Node version that actually executes it, not the repository pin.
  target: "node24",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  plugins: [pgliteBundlePaths],
  alias: {
    "@elizaos/registry/first-party/curated-app-definitions.json": resolve(
      repoRoot,
      "packages",
      "registry",
      "src",
      "first-party",
      "curated-app-definitions.json",
    ),
    dotenv: resolve(repoRoot, "node_modules", "dotenv", "lib", "main.js"),
  },
  banner: {
    js: [
      'import { createRequire as __doolittleCreateRequire } from "node:module";',
      "const require = __doolittleCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  external: [
    "electron",
    "sharp",
    "term.js",
    "pty.js",
    "onnxruntime-node",
    "@napi-rs/keyring",
    "@napi-rs/keyring-*",
    "@node-llama-cpp/*",
    "@elizaos/plugin-local-inference",
    "@elizaos/plugin-aosp-local-inference",
  ],
});

// The source entrypoint uses `#!/usr/bin/env nub` for source-checkout launches.
// Packaged apps execute this bundle as an argument to Electron's embedded Node,
// so retaining that source-only launcher hint is misleading and unnecessary.
const bundledRuntime = readFileSync(outputPath, "utf8");
writeFileSync(
  outputPath,
  bundledRuntime.replace(/^#![^\r\n]*(?:\r?\n|$)/u, ""),
  "utf8",
);

writeFileSync(
  resolve(outputDir, "runtime-manifest.json"),
  `${JSON.stringify(
    {
      runtime: "node",
      entry: basename(outputPath),
      node: "electron-embedded",
      assets: pgliteAssets.length,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Runtime ready: ${outputPath}`);
