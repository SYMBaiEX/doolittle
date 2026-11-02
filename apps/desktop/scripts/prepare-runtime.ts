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
import { build, type Metafile } from "esbuild";
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
    "doolittle-runtime": resolve(repoRoot, "apps", "cli", "src", "index.ts"),
    "doolittle-acp": resolve(repoRoot, "apps", "cli", "src", "acp-server.ts"),
  },
  outdir: outputDir,
  entryNames: "[name]",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  // Electron 44 embeds Node 24. Keep the packaged runtime syntax compatible
  // with the Node version that actually executes it, not the repository pin.
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
    // into Doolittle's single-file MIT desktop runtime.
    "ffmpeg-static",
    "@napi-rs/keyring-*",
    "@node-llama-cpp/*",
    ...nativeExternalPackages,
    "@elizaos/*",
    "@elizaos/plugin-local-inference",
    "@elizaos/plugin-aosp-local-inference",
  ],
});

const tracedSdk = await copySdkRuntimePackages(
  repoRoot,
  outputDir,
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
      assets: [...new Set(tracedSdk.files)].sort((a, b) => a.localeCompare(b)),
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
