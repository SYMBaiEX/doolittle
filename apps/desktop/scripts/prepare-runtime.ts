import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readRegularFileSync } from "@doolittle/storage";
import { build, type Metafile } from "esbuild";
import {
  DESKTOP_PGLITE_SEED_FILE,
  type DesktopPgliteSeedReceipt,
  desktopPgliteRuntimeDigest,
  MAX_PGLITE_SEED_BYTES,
} from "../../../packages/agent/src/runtime/bootstrap/runtime/desktop-database-seed";
import {
  assertDesktopDistributionLicensePolicy,
  discoverDynamicCommonJsPackages,
  discoverRuntimeAssetReferences,
  emittedMetafileInputPaths,
  type RuntimeDependencyInventoryEntry,
  type RuntimeDependencyLicenseSource,
  runtimePackageForSource,
  stableRuntimeDependencyInventory,
  writeRuntimeThirdPartyNotices,
} from "./runtime-requirements";
import { copySdkRuntimePackages } from "./sdk-runtime-packages";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const repoRequire = createRequire(resolve(repoRoot, "package.json"));
// Playwright imports these optional modules without declaring a dependency.
// Qualify the real published CJS entrypoints before producing the artifact.
import.meta.resolve("chromium-bidi/lib/cjs/bidiMapper/BidiMapper");
import.meta.resolve("chromium-bidi/lib/cjs/cdp/CdpConnection");
const outputDir = resolve(desktopRoot, "build", "runtime");
const runtimeManifestPath = resolve(outputDir, "runtime-manifest.json");
const outputPath = resolve(outputDir, "doolittle-runtime.mjs");
const acpOutputPath = resolve(outputDir, "doolittle-acp.mjs");
const runtimeNodeModulesDir = resolve(outputDir, "node_modules");
// Keep native modules and executable packages at their real filesystem paths.
const nativeExternalPackages = [
  "@snazzah/davey",
  "@lydell/node-pty",
  "@napi-rs/keyring",
  "acpx",
] as const;
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

type PackageJson = {
  name?: string;
  version?: string;
};

function bundledPackageInventory(
  metafile: Metafile,
): RuntimeDependencyInventoryEntry[] {
  return stableRuntimeDependencyInventory(
    emittedMetafileInputPaths(metafile)
      .map((source) => runtimePackageForSource(repoRoot, source))
      .filter(
        (entry): entry is RuntimeDependencyLicenseSource => entry !== undefined,
      ),
  );
}

function bundledPackageLicenseSources(
  metafile: Metafile,
): RuntimeDependencyLicenseSource[] {
  return emittedMetafileInputPaths(metafile)
    .map((source) => runtimePackageForSource(repoRoot, source))
    .filter(
      (entry): entry is RuntimeDependencyLicenseSource => entry !== undefined,
    );
}

function thirdPartyRuntimeLicenseSources(
  sources: readonly RuntimeDependencyLicenseSource[],
): RuntimeDependencyLicenseSource[] {
  return sources.filter(
    (source) =>
      relative(repoRoot, source.directory).startsWith("node_modules/") ||
      relative(repoRoot, source.directory).startsWith(
        "vendor/elizaos/packages/",
      ),
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
  "Bundling Doolittle's client runtime while preserving native SDK package paths…",
);

const runtimeBuild = await build({
  absWorkingDir: repoRoot,
  entryPoints: {
    "doolittle-runtime": resolve(
      repoRoot,
      "apps",
      "cli",
      "src",
      "managed-runtime.ts",
    ),
    "doolittle-acp": resolve(repoRoot, "apps", "cli", "src", "acp-server.ts"),
  },
  outdir: outputDir,
  entryNames: "[name]",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  splitting: true,
  platform: "node",
  format: "esm",
  // Keep this syntax baseline compatible with the Node runtime embedded in Electron.
  target: "node24",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  metafile: true,
  logLevel: "info",
  define: {
    // Make the distribution policy a build-time constant so esbuild removes
    // the guarded optional imports and their full dependency closures.
    "process.env.DOOLITTLE_DISTRIBUTED_DESKTOP_RUNTIME": '"1"',
  },
  alias: {
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
    // into Doolittle's MIT desktop runtime.
    "ffmpeg-static",
    "@napi-rs/keyring-*",
    "@node-llama-cpp/*",
    ...nativeExternalPackages,
    "@elizaos/*",
    "@elizaos/plugin-local-inference",
    "@elizaos/plugin-aosp-local-inference",
  ],
});

const bundlePaths = Object.keys(runtimeBuild.metafile.outputs)
  .map((file) => resolve(repoRoot, file))
  .sort((a, b) => a.localeCompare(b));
const tracedSdk = await copySdkRuntimePackages(
  repoRoot,
  outputDir,
  bundlePaths,
  nativeExternalPackages,
  [
    ...new Set(
      Object.values(runtimeBuild.metafile.outputs).flatMap((output) =>
        output.imports
          .filter(
            (entry) => entry.external && entry.path.startsWith("@elizaos/"),
          )
          .map((entry) => entry.path),
      ),
    ),
  ],
);

// Generate a data-free schema snapshot with the actual copied SDK and PGlite
// versions. A new process keeps live databases, accounts, and user settings
// outside the artifact build.
const seed = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    `import { writeFileSync } from "node:fs";
     import { createMigratedSnapshot, plugin } from "@elizaos/plugin-sql";
     if (!plugin.schema) throw new Error("Packaged SQL schema missing");
     writeFileSync(process.argv[1], await createMigratedSnapshot([
       { name: plugin.name, schema: plugin.schema },
     ]));`,
    DESKTOP_PGLITE_SEED_FILE,
  ],
  {
    cwd: outputDir,
    env: {
      LOG_LEVEL: "error",
      PGLITE_MIGRATED_SNAPSHOT: "0",
      ...(process.platform === "win32"
        ? { SystemRoot: process.env.SystemRoot }
        : {}),
    },
    encoding: "utf8",
    timeout: 60_000,
  },
);
if (seed.status !== 0) {
  throw new Error(
    `Packaged PGlite seed generation failed. ${seed.stderr ?? ""}`,
    {
      cause: seed.error,
    },
  );
}
const pgliteSeed: DesktopPgliteSeedReceipt = {
  file: DESKTOP_PGLITE_SEED_FILE,
  sha256: createHash("sha256")
    .update(
      readRegularFileSync(
        resolve(outputDir, DESKTOP_PGLITE_SEED_FILE),
        MAX_PGLITE_SEED_BYTES,
      ),
    )
    .digest("hex"),
  runtimeSha256: desktopPgliteRuntimeDigest(runtimeManifestPath),
};
const copiedNativePackages = [...nativeExternalPackages].sort((a, b) =>
  a.localeCompare(b),
);
const copiedNativeRuntime = { licenseSources: tracedSdk.licenseSources };

const bundledPackages = stableRuntimeDependencyInventory([
  ...bundledPackageInventory(runtimeBuild.metafile),
]);

const thirdPartyBundledLicenseSources = thirdPartyRuntimeLicenseSources([
  ...bundledPackageLicenseSources(runtimeBuild.metafile),
  ...tracedSdk.licenseSources,
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

// Source entrypoints use `#!/usr/bin/env nub` for source-checkout launches.
// Packaged apps execute these bundles through Electron's embedded Node, so
// retaining that source-only launcher hint is misleading and unnecessary.
const bundles = bundlePaths.map((path) => {
  const original = readFileSync(path, "utf8");
  const source = original.replace(/^#![^\r\n]*(?:\r?\n|$)/u, "");
  if (source !== original) writeFileSync(path, source, "utf8");
  return {
    file: basename(path),
    sha256: createHash("sha256").update(source).digest("hex"),
    source,
  };
});
const bundledSource = bundles.map(({ source }) => source).join("\n");

for (const packageName of discoverDynamicCommonJsPackages(bundledSource)) {
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

const referencedRuntimeAssets = discoverRuntimeAssetReferences(bundledSource);
const missingRuntimeAssets = referencedRuntimeAssets.filter(
  (asset) => !existsSync(resolve(outputDir, asset)),
);
if (missingRuntimeAssets.length > 0) {
  throw new Error(
    `Packaged runtime is missing referenced assets: ${missingRuntimeAssets.join(", ")}`,
  );
}

writeFileSync(
  runtimeManifestPath,
  `${JSON.stringify(
    {
      schema: 1,
      runtime: "node",
      entry: basename(outputPath),
      acpEntry: basename(acpOutputPath),
      node: "electron-embedded",
      assets: [...new Set([...tracedSdk.files, pgliteSeed.file])].sort((a, b) =>
        a.localeCompare(b),
      ),
      pgliteSeed,
      bundles: bundles.map(({ file, sha256 }) => ({ file, sha256 })),
      tracedPackages: tracedSdk.packages,
      nativeEntryPackages: [...nativeExternalPackages].sort(),
      nativePackages: copiedNativePackages,
      bundledPackages,
      nativeExternalPackages: installedPackageInventory(nativeExternalPackages),
      nativePackageClosure: tracedSdk.packages,
      thirdPartyNotices,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Runtime ready: ${outputPath}`);
