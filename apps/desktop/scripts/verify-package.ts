import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listPackage } from "@electron/asar";
import {
  assertPackageComposition,
  MAX_APP_ASAR_BYTES,
  type ProductionPackageManifest,
  packageNamesFromAsarEntries,
  productionDependencyClosure,
} from "./package-composition";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);

type RuntimeManifest = {
  assets?: string[];
  entry?: string;
  nativePackages?: string[];
};

function argumentValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function currentPlatformAppAsarPath(
  releaseDirectory: string,
  platform = process.platform,
  arch = process.arch,
): string {
  const relativePaths =
    platform === "darwin"
      ? [
          `mac-${arch}/Doolittle.app/Contents/Resources/app.asar`,
          "mac/Doolittle.app/Contents/Resources/app.asar",
        ]
      : platform === "win32"
        ? [
            `win-${arch}-unpacked/resources/app.asar`,
            "win-unpacked/resources/app.asar",
          ]
        : [
            `linux-${arch}-unpacked/resources/app.asar`,
            "linux-unpacked/resources/app.asar",
          ];
  const candidates = relativePaths
    .map((relativePath) => resolve(releaseDirectory, relativePath))
    .filter(existsSync);
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one ${platform} app.asar in ${releaseDirectory}; found ${candidates.length}.`,
    );
  }
  return candidates[0];
}

function loadManifest(path: string): ProductionPackageManifest {
  return JSON.parse(readFileSync(path, "utf8")) as ProductionPackageManifest;
}

function installedProductionClosure(
  rootManifest: ProductionPackageManifest,
): string[] {
  const resolver = createRequire(resolve(desktopRoot, "package.json"));
  const manifests = new Map<string, ProductionPackageManifest | undefined>();
  const pending: Array<{ packageName: string; resolver: NodeRequire }> =
    Object.keys(rootManifest.dependencies ?? {}).map((packageName) => ({
      packageName,
      resolver,
    }));
  const visited = new Set<string>();
  while (pending.length > 0) {
    const pendingPackage = pending.pop();
    if (!pendingPackage || visited.has(pendingPackage.packageName)) continue;
    const { packageName, resolver: packageResolver } = pendingPackage;
    visited.add(packageName);
    const manifestPath = packageResolver.resolve(`${packageName}/package.json`);
    const manifest = loadManifest(manifestPath);
    const childResolver = createRequire(manifestPath);
    const installedOptionalDependencies: Record<string, string> = {};
    for (const childPackage of Object.keys(manifest.dependencies ?? {})) {
      childResolver.resolve(`${childPackage}/package.json`);
      pending.push({ packageName: childPackage, resolver: childResolver });
    }
    for (const [childPackage, version] of Object.entries(
      manifest.optionalDependencies ?? {},
    )) {
      try {
        childResolver.resolve(`${childPackage}/package.json`);
        installedOptionalDependencies[childPackage] = version;
        pending.push({ packageName: childPackage, resolver: childResolver });
      } catch {
        // Optional packages may be absent on this operating system.
      }
    }
    manifests.set(packageName, {
      dependencies: manifest.dependencies,
      optionalDependencies: installedOptionalDependencies,
    });
  }
  return productionDependencyClosure(rootManifest.dependencies, manifests);
}

function verifyPackagedNativeRuntime(appAsarPath: string): string[] {
  const runtimeBin = resolve(dirname(appAsarPath), "runtime", "bin");
  const runtimeManifestPath = resolve(runtimeBin, "runtime-manifest.json");
  if (!existsSync(runtimeManifestPath)) {
    throw new Error(
      `Packaged runtime manifest is missing: ${runtimeManifestPath}`,
    );
  }
  const runtimeManifest = JSON.parse(
    readFileSync(runtimeManifestPath, "utf8"),
  ) as RuntimeManifest;
  const runtimeEntry = runtimeManifest.entry?.trim();
  if (!runtimeEntry || !existsSync(resolve(runtimeBin, runtimeEntry))) {
    throw new Error("Packaged runtime entry is missing.");
  }
  const missingAssets = (runtimeManifest.assets ?? []).filter(
    (asset) => !existsSync(resolve(runtimeBin, asset)),
  );
  if (missingAssets.length > 0) {
    throw new Error(
      `Packaged runtime assets are missing: ${missingAssets.join(", ")}`,
    );
  }
  const nativePackages = runtimeManifest.nativePackages ?? [];
  const runtimeRequire = createRequire(resolve(runtimeBin, runtimeEntry));
  for (const packageName of nativePackages) {
    runtimeRequire.resolve(`${packageName}/package.json`);
    runtimeRequire(packageName);
  }
  return nativePackages;
}

function main(): void {
  const appAsarPath =
    argumentValue("--app-asar") ??
    currentPlatformAppAsarPath(resolve(desktopRoot, "release"));
  if (!existsSync(appAsarPath)) {
    throw new Error(`app.asar is missing: ${appAsarPath}`);
  }
  const rootManifest = loadManifest(resolve(desktopRoot, "package.json"));
  const packagedModules = packageNamesFromAsarEntries(
    listPackage(appAsarPath, { isPack: false }),
  );
  const allowedModules = installedProductionClosure(rootManifest);
  const asarBytes = statSync(appAsarPath).size;
  assertPackageComposition({ asarBytes, packagedModules, allowedModules });
  const nativePackages = verifyPackagedNativeRuntime(appAsarPath);
  console.log(
    `Desktop package verified: ${(asarBytes / 1024 / 1024).toFixed(1)} MiB app.asar, ${packagedModules.length} packaged modules, ${allowedModules.length} allowed production modules, ${nativePackages.length} native runtime packages (limit ${(MAX_APP_ASAR_BYTES / 1024 / 1024).toFixed(0)} MiB).`,
  );
}

main();
