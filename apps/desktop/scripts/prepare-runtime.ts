import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import { discoverDynamicCommonJsPackages } from "./runtime-requirements";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const outputDir = resolve(desktopRoot, "build", "runtime");
const outputPath = resolve(outputDir, "doolittle-runtime.mjs");
const acpOutputPath = resolve(outputDir, "doolittle-acp.mjs");
const runtimeNodeModulesDir = resolve(outputDir, "node_modules");
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
  entryPoints: {
    "doolittle-runtime": resolve(
      repoRoot,
      "packages",
      "agent",
      "src",
      "index.ts",
    ),
    "doolittle-acp": resolve(
      repoRoot,
      "packages",
      "agent",
      "src",
      "acp-server.ts",
    ),
  },
  outdir: outputDir,
  entryNames: "[name]",
  outExtension: { ".js": ".mjs" },
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

async function bundleCommonJsRuntimePackage(
  name: string,
  entry: string,
): Promise<void> {
  const packageDir = resolve(runtimeNodeModulesDir, name);
  mkdirSync(packageDir, { recursive: true });
  await build({
    absWorkingDir: repoRoot,
    entryPoints: [entry],
    outfile: resolve(packageDir, "index.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    minify: true,
    sourcemap: false,
    legalComments: "none",
    logLevel: "info",
  });
  writeFileSync(
    resolve(packageDir, "package.json"),
    `${JSON.stringify({ name, private: true, main: "index.cjs" }, null, 2)}\n`,
    "utf8",
  );
}

await bundleCommonJsRuntimePackage(
  "git-workspace-service",
  resolve(
    repoRoot,
    "node_modules",
    "git-workspace-service",
    "dist",
    "index.cjs",
  ),
);

const readableStreamShimDir = resolve(
  runtimeNodeModulesDir,
  "node-readable-to-web-readable-stream",
);
mkdirSync(readableStreamShimDir, { recursive: true });
writeFileSync(
  resolve(readableStreamShimDir, "index.cjs"),
  [
    '"use strict";',
    'const { Readable } = require("node:stream");',
    "exports.makeDefaultReadableStreamFromNodeReadable = (stream) =>",
    "  Readable.toWeb(stream);",
    "",
  ].join("\n"),
  "utf8",
);
writeFileSync(
  resolve(readableStreamShimDir, "package.json"),
  `${JSON.stringify(
    {
      name: "node-readable-to-web-readable-stream",
      private: true,
      main: "index.cjs",
    },
    null,
    2,
  )}\n`,
  "utf8",
);

// Source entrypoints use `#!/usr/bin/env nub` for source-checkout launches.
// Packaged apps execute these bundles through Electron's embedded Node, so
// retaining that source-only launcher hint is misleading and unnecessary.
const bundledEntries = [outputPath, acpOutputPath].map((entry) => {
  const bundle = readFileSync(entry, "utf8");
  const withoutShebang = bundle.replace(/^#![^\r\n]*(?:\r?\n|$)/u, "");
  writeFileSync(entry, withoutShebang, "utf8");
  return withoutShebang;
});

for (const packageName of discoverDynamicCommonJsPackages(
  bundledEntries.join("\n"),
)) {
  const manifestPath = resolve(
    runtimeNodeModulesDir,
    packageName,
    "package.json",
  );
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Packaged runtime is missing dynamic CommonJS dependency: ${packageName}`,
    );
  }
}

writeFileSync(
  resolve(outputDir, "runtime-manifest.json"),
  `${JSON.stringify(
    {
      runtime: "node",
      entry: basename(outputPath),
      acpEntry: basename(acpOutputPath),
      node: "electron-embedded",
      assets: pgliteAssets.length,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Runtime ready: ${outputPath}`);
