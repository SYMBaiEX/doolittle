import { createHash } from "node:crypto";
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
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Metafile, type Plugin } from "esbuild";
import {
  assertDesktopDistributionLicensePolicy,
  discoverDynamicCommonJsPackages,
  discoverRuntimeAssetReferences,
  emittedMetafileInputPaths,
  type RuntimeDependencyInventoryEntry,
  type RuntimeDependencyLicenseSource,
  type RuntimePackageManifest,
  runtimePackageClosure,
  stableRuntimeDependencyInventory,
  writeRuntimeThirdPartyNotices,
} from "./runtime-requirements";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const repoRequire = createRequire(resolve(repoRoot, "package.json"));
const outputDir = resolve(desktopRoot, "build", "runtime");
const outputPath = resolve(outputDir, "doolittle-runtime.mjs");
const acpOutputPath = resolve(outputDir, "doolittle-acp.mjs");
const runtimeNodeModulesDir = resolve(outputDir, "node_modules");
const nativeExternalPackages = ["@snazzah/davey", "@lydell/node-pty"] as const;
const pluginSqlRequire = createRequire(
  repoRequire.resolve("@elizaos/plugin-sql/package.json"),
);
const pgliteDist = dirname(pluginSqlRequire.resolve("@electric-sql/pglite"));

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

type PackageJson = RuntimePackageManifest & {
  name?: string;
  version?: string;
};

function packageRoot(directory: string, manifest: PackageJson): string {
  let root = directory;
  while (true) {
    const parent = dirname(root);
    const parentManifestPath = resolve(parent, "package.json");
    if (!existsSync(parentManifestPath)) return root;
    const parentManifest = JSON.parse(
      readFileSync(parentManifestPath, "utf8"),
    ) as PackageJson;
    if (
      parentManifest.name !== manifest.name ||
      parentManifest.version !== manifest.version
    ) {
      return root;
    }
    root = parent;
  }
}

function nearestPackageForSource(
  sourcePath: string,
): RuntimeDependencyLicenseSource | undefined {
  let directory = dirname(resolve(repoRoot, sourcePath));
  while (
    relative(repoRoot, directory) &&
    !relative(repoRoot, directory).startsWith("..")
  ) {
    const manifestPath = resolve(directory, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(
        readFileSync(manifestPath, "utf8"),
      ) as PackageJson;
      if (manifest.name?.trim() && manifest.version?.trim()) {
        return {
          name: manifest.name,
          version: manifest.version,
          directory: packageRoot(directory, manifest),
        };
      }
      return undefined;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
  return undefined;
}

function bundledPackageInventory(
  metafile: Metafile,
): RuntimeDependencyInventoryEntry[] {
  return stableRuntimeDependencyInventory(
    emittedMetafileInputPaths(metafile)
      .map(nearestPackageForSource)
      .filter(
        (entry): entry is RuntimeDependencyLicenseSource => entry !== undefined,
      ),
  );
}

function bundledPackageLicenseSources(
  metafile: Metafile,
): RuntimeDependencyLicenseSource[] {
  return emittedMetafileInputPaths(metafile)
    .map(nearestPackageForSource)
    .filter(
      (entry): entry is RuntimeDependencyLicenseSource => entry !== undefined,
    );
}

function thirdPartyRuntimeLicenseSources(
  sources: readonly RuntimeDependencyLicenseSource[],
): RuntimeDependencyLicenseSource[] {
  return sources.filter((source) =>
    relative(repoRoot, source.directory).startsWith("node_modules/"),
  );
}

function installedPackageInventory(
  packageNames: readonly string[],
): RuntimeDependencyInventoryEntry[] {
  return stableRuntimeDependencyInventory(
    packageNames.map((name) => {
      const manifestPath = repoRequire.resolve(`${name}/package.json`);
      const manifest = JSON.parse(
        readFileSync(manifestPath, "utf8"),
      ) as PackageJson;
      if (!manifest.name?.trim() || !manifest.version?.trim()) {
        throw new Error(
          `Runtime package has no name or version: ${manifestPath}`,
        );
      }
      return { name: manifest.name, version: manifest.version };
    }),
  );
}

console.log(
  `Bundling the Doolittle runtime for Electron's embedded Node (${pgliteAssets.length} database assets)…`,
);

const runtimeBuild = await build({
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
  metafile: true,
  logLevel: "info",
  plugins: [pgliteBundlePaths],
  define: {
    // Make the distribution policy a build-time constant so esbuild removes
    // the guarded optional imports and their full dependency closures.
    "process.env.DOOLITTLE_DISTRIBUTED_DESKTOP_RUNTIME": '"1"',
  },
  alias: {
    "@elizaos/registry/first-party/curated-app-definitions.json": resolve(
      repoRoot,
      "packages",
      "registry",
      "src",
      "first-party",
      "curated-app-definitions.json",
    ),
    dotenv: repoRequire.resolve("dotenv"),
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
    // Discord voice treats this optional lookup as best-effort and falls back
    // to a system ffmpeg/avconv binary. Do not fold the GPL executable helper
    // into Doolittle's single-file MIT desktop runtime.
    "ffmpeg-static",
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
  const manifests = new Map<string, RuntimePackageManifest | undefined>();
  const sourceDirectories = new Map<string, string>();
  const pending: Array<{ name: string; resolver: NodeRequire }> =
    rootPackages.map((name) => ({ name, resolver: repoRequire }));

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

function copyNativeRuntimePackages(rootPackages: readonly string[]): {
  packageNames: string[];
  licenseSources: RuntimeDependencyLicenseSource[];
} {
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
  return {
    packageNames,
    licenseSources: packageNames.map((name) => {
      const directory = sourceDirectories.get(name);
      if (!directory) {
        throw new Error(`Native runtime package was not resolved: ${name}`);
      }
      const manifest = JSON.parse(
        readFileSync(resolve(directory, "package.json"), "utf8"),
      ) as PackageJson;
      if (!manifest.name?.trim() || !manifest.version?.trim()) {
        throw new Error(`Runtime package has no name or version: ${directory}`);
      }
      return { name: manifest.name, version: manifest.version, directory };
    }),
  };
}

const copiedNativeRuntime = copyNativeRuntimePackages(nativeExternalPackages);
const copiedNativePackages = copiedNativeRuntime.packageNames;

async function bundleCommonJsRuntimePackage(
  name: string,
  entry: string,
): Promise<Metafile> {
  const packageDir = resolve(runtimeNodeModulesDir, name);
  mkdirSync(packageDir, { recursive: true });
  const result = await build({
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
    metafile: true,
    logLevel: "info",
  });
  writeFileSync(
    resolve(packageDir, "package.json"),
    `${JSON.stringify({ name, private: true, main: "index.cjs" }, null, 2)}\n`,
    "utf8",
  );
  return result.metafile;
}

const gitWorkspaceServiceBuild = await bundleCommonJsRuntimePackage(
  "git-workspace-service",
  resolve(
    repoRoot,
    "node_modules",
    "git-workspace-service",
    "dist",
    "index.cjs",
  ),
);

const bundledPackages = stableRuntimeDependencyInventory([
  ...bundledPackageInventory(runtimeBuild.metafile),
  ...bundledPackageInventory(gitWorkspaceServiceBuild),
]);

const thirdPartyBundledLicenseSources = thirdPartyRuntimeLicenseSources([
  ...bundledPackageLicenseSources(runtimeBuild.metafile),
  ...bundledPackageLicenseSources(gitWorkspaceServiceBuild),
]);
const thirdPartyNoticePackages = stableRuntimeDependencyInventory([
  ...thirdPartyBundledLicenseSources.map(({ name, version }) => ({
    name,
    version,
  })),
  ...installedPackageInventory(copiedNativePackages),
]);
const thirdPartyNoticesPath = resolve(outputDir, "THIRD-PARTY-NOTICES.txt");
assertDesktopDistributionLicensePolicy(thirdPartyNoticePackages, [
  ...thirdPartyBundledLicenseSources,
  ...copiedNativeRuntime.licenseSources,
]);
writeRuntimeThirdPartyNotices(thirdPartyNoticesPath, thirdPartyNoticePackages, [
  ...thirdPartyBundledLicenseSources,
  ...copiedNativeRuntime.licenseSources,
]);
const thirdPartyNotices = {
  file: basename(thirdPartyNoticesPath),
  packages: thirdPartyNoticePackages,
  sha256: createHash("sha256")
    .update(readFileSync(thirdPartyNoticesPath))
    .digest("hex"),
};

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

const referencedRuntimeAssets = discoverRuntimeAssetReferences(
  bundledEntries.join("\n"),
);
const missingRuntimeAssets = referencedRuntimeAssets.filter(
  (asset) => !existsSync(resolve(outputDir, asset)),
);
if (missingRuntimeAssets.length > 0) {
  throw new Error(
    `Packaged runtime is missing referenced assets: ${missingRuntimeAssets.join(", ")}`,
  );
}

writeFileSync(
  resolve(outputDir, "runtime-manifest.json"),
  `${JSON.stringify(
    {
      schema: 1,
      runtime: "node",
      entry: basename(outputPath),
      acpEntry: basename(acpOutputPath),
      node: "electron-embedded",
      assets: pgliteAssets,
      nativeEntryPackages: [...nativeExternalPackages].sort(),
      nativePackages: copiedNativePackages,
      bundledPackages,
      nativeExternalPackages: installedPackageInventory(nativeExternalPackages),
      nativePackageClosure: installedPackageInventory(copiedNativePackages),
      thirdPartyNotices,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Runtime ready: ${outputPath}`);
