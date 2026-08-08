import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import {
  discoverDynamicCommonJsPackages,
  type RuntimePackageManifest,
  runtimePackageClosure,
} from "./runtime-requirements";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const outputDir = resolve(desktopRoot, "build", "runtime");
const outputPath = resolve(outputDir, "doolittle-runtime.mjs");
const acpOutputPath = resolve(outputDir, "doolittle-acp.mjs");
const runtimeNodeModulesDir = resolve(outputDir, "node_modules");
const nativeExternalPackages = ["@snazzah/davey"] as const;
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
    ...nativeExternalPackages,
    "@elizaos/plugin-local-inference",
    "@elizaos/plugin-aosp-local-inference",
  ],
});

function installedRuntimePackageGraph(rootPackages: readonly string[]): {
  manifests: Map<string, RuntimePackageManifest | undefined>;
  sourceDirectories: Map<string, string>;
} {
  const rootResolver = createRequire(resolve(repoRoot, "package.json"));
  const manifests = new Map<string, RuntimePackageManifest | undefined>();
  const sourceDirectories = new Map<string, string>();
  const pending: Array<{ name: string; resolver: NodeRequire }> =
    rootPackages.map((name) => ({ name, resolver: rootResolver }));

  while (pending.length > 0) {
    const next = pending.pop();
    if (!next || manifests.has(next.name)) continue;
    const manifestPath = next.resolver.resolve(`${next.name}/package.json`);
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as RuntimePackageManifest;
    const packageResolver = createRequire(manifestPath);
    const installedOptionalDependencies: Record<string, string> = {};

    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      packageResolver.resolve(`${dependency}/package.json`);
      pending.push({ name: dependency, resolver: packageResolver });
    }
    for (const [dependency, version] of Object.entries(
      manifest.optionalDependencies ?? {},
    )) {
      try {
        packageResolver.resolve(`${dependency}/package.json`);
        installedOptionalDependencies[dependency] = version;
        pending.push({ name: dependency, resolver: packageResolver });
      } catch {
        // Platform-specific optional packages are absent by design.
      }
    }

    manifests.set(next.name, {
      dependencies: manifest.dependencies,
      optionalDependencies: installedOptionalDependencies,
    });
    sourceDirectories.set(next.name, dirname(manifestPath));
  }

  return { manifests, sourceDirectories };
}

function copyNativeRuntimePackages(rootPackages: readonly string[]): string[] {
  const { manifests, sourceDirectories } =
    installedRuntimePackageGraph(rootPackages);
  const packageNames = runtimePackageClosure(rootPackages, manifests);
  for (const packageName of packageNames) {
    const sourceDirectory = sourceDirectories.get(packageName);
    if (!sourceDirectory) {
      throw new Error(
        `Native runtime package was not resolved: ${packageName}`,
      );
    }
    const destination = resolve(
      runtimeNodeModulesDir,
      ...packageName.split("/"),
    );
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(sourceDirectory, destination, {
      recursive: true,
      dereference: true,
    });
  }
  return packageNames;
}

const copiedNativePackages = copyNativeRuntimePackages(nativeExternalPackages);

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
      nativePackages: copiedNativePackages,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Runtime ready: ${outputPath}`);
