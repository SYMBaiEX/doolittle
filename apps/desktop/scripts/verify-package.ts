import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve } from "node:path";
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
  acpEntry: string;
  assets: string[];
  bundledPackages: RuntimeDependencyInventoryEntry[];
  entry: string;
  nativeEntryPackages: string[];
  nativeExternalPackages: RuntimeDependencyInventoryEntry[];
  nativePackageClosure: RuntimeDependencyInventoryEntry[];
  nativePackages: string[];
  node: string;
  runtime: string;
  schema: 1;
  thirdPartyNotices: {
    file: string;
    packages: RuntimeDependencyInventoryEntry[];
    sha256: string;
  };
};

type RuntimeDependencyInventoryEntry = {
  name: string;
  version: string;
};

type MinimumRuntimeDependencyVersion = {
  minimum: string;
  url: string;
};

const MINIMUM_RUNTIME_DEPENDENCY_VERSIONS: Readonly<
  Record<string, MinimumRuntimeDependencyVersion>
> = {
  "adm-zip": {
    minimum: "0.6.0",
    url: "https://github.com/advisories/GHSA-xcpc-8h2w-3j85",
  },
  axios: {
    minimum: "1.18.0",
    url: "https://github.com/advisories/GHSA-gcfj-64vw-6mp9",
  },
  "bigint-buffer": {
    minimum: "1.1.6",
    url: "https://github.com/advisories/GHSA-3gc7-fjrx-p6mg",
  },
  "extract-zip": {
    minimum: "2.0.2",
    url: "https://github.com/advisories/GHSA-jmr9-qjv8-65gv",
  },
  "image-size": {
    minimum: "2.0.3",
    url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
  },
  lodash: {
    minimum: "4.17.24",
    url: "https://github.com/advisories/GHSA-r5fr-rjxr-66jc",
  },
  "serialize-javascript": {
    minimum: "7.0.3",
    url: "https://github.com/advisories/GHSA-5c6j-r48x-rmvq",
  },
  sharp: {
    minimum: "0.35.0",
    url: "https://github.com/advisories/GHSA-f88m-g3jw-g9cj",
  },
  tmp: {
    minimum: "0.2.6",
    url: "https://github.com/advisories/GHSA-ph9p-34f9-6g65",
  },
};

type ParsedRuntimeVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: boolean;
};

function parsedRuntimeVersion(version: string): ParsedRuntimeVersion | null {
  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u,
  );
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: Boolean(match[4]),
  };
}

function runtimeVersionAtLeast(version: string, minimum: string): boolean {
  const current = parsedRuntimeVersion(version);
  const required = parsedRuntimeVersion(minimum);
  if (!current || !required) return false;
  for (const field of ["major", "minor", "patch"] as const) {
    if (current[field] !== required[field]) {
      return current[field] > required[field];
    }
  }
  return !current.prerelease || required.prerelease;
}

function safeUndiciVersion(version: string): boolean {
  const parsed = parsedRuntimeVersion(version);
  if (!parsed) return false;
  if (parsed.major === 6) return runtimeVersionAtLeast(version, "6.27.0");
  if (parsed.major === 7) return runtimeVersionAtLeast(version, "7.29.0");
  if (parsed.major === 8) return runtimeVersionAtLeast(version, "8.9.0");
  return parsed.major > 8;
}

function safeWsVersion(version: string): boolean {
  const parsed = parsedRuntimeVersion(version);
  if (!parsed) return false;
  return parsed.major !== 8 || runtimeVersionAtLeast(version, "8.21.0");
}

/**
 * Blocks the high-severity dependency ranges reviewed for the packaged desktop
 * runtime. This intentionally evaluates the immutable artifact inventory rather
 * than the broader development graph, which includes optional Eliza plugins
 * that are not shipped in the desktop bundle.
 */
export function validateRuntimeDependencySecurityPolicy(
  manifest: RuntimeManifest,
): void {
  const dependencies = stableRuntimeDependencies([
    ...manifest.bundledPackages,
    ...manifest.nativePackageClosure,
  ]);
  const rejected: string[] = [];
  for (const dependency of dependencies) {
    if (
      dependency.name === "undici" &&
      !safeUndiciVersion(dependency.version)
    ) {
      rejected.push(
        `${dependency.name}@${dependency.version} (https://github.com/advisories/GHSA-4cwx-7wf7-3272)`,
      );
      continue;
    }
    if (dependency.name === "ws" && !safeWsVersion(dependency.version)) {
      rejected.push(
        `${dependency.name}@${dependency.version} (https://github.com/advisories/GHSA-96hv-2xvq-fx4p)`,
      );
      continue;
    }
    const policy = MINIMUM_RUNTIME_DEPENDENCY_VERSIONS[dependency.name];
    if (policy && !runtimeVersionAtLeast(dependency.version, policy.minimum)) {
      rejected.push(`${dependency.name}@${dependency.version} (${policy.url})`);
    }
  }
  if (rejected.length > 0) {
    throw new Error(
      `Packaged runtime contains blocked high-severity dependency versions: ${rejected.join(", ")}`,
    );
  }
}

function stableRuntimeDependencies(
  dependencies: RuntimeDependencyInventoryEntry[],
): RuntimeDependencyInventoryEntry[] {
  return [
    ...new Map(
      dependencies.map((dependency) => [
        `${dependency.name}\u0000${dependency.version}`,
        dependency,
      ]),
    ).values(),
  ].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.version.localeCompare(right.version),
  );
}

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

function isSortedUniqueStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    ) &&
    value.every((entry, index, entries) =>
      index === 0 ? true : entries[index - 1].localeCompare(entry) < 0,
    )
  );
}

function inventoryNames(entries: RuntimeDependencyInventoryEntry[]): string[] {
  return entries.map((entry) => entry.name);
}

function inventoryIsStable(
  value: unknown,
): value is RuntimeDependencyInventoryEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RuntimeDependencyInventoryEntry).name === "string" &&
        (entry as RuntimeDependencyInventoryEntry).name.trim().length > 0 &&
        typeof (entry as RuntimeDependencyInventoryEntry).version ===
          "string" &&
        (entry as RuntimeDependencyInventoryEntry).version.trim().length > 0,
    ) &&
    value.every((entry, index, entries) =>
      index === 0
        ? true
        : (
            entries[index - 1] as RuntimeDependencyInventoryEntry
          ).name.localeCompare(
            (entry as RuntimeDependencyInventoryEntry).name,
          ) < 0 ||
          ((entries[index - 1] as RuntimeDependencyInventoryEntry).name ===
            (entry as RuntimeDependencyInventoryEntry).name &&
            (
              entries[index - 1] as RuntimeDependencyInventoryEntry
            ).version.localeCompare(
              (entry as RuntimeDependencyInventoryEntry).version,
            ) < 0),
    )
  );
}

function sameStringSet(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((entry, index) => entry === [...right].sort()[index])
  );
}

/** Validates the portable runtime inventory without invoking package managers. */
export function validateRuntimeManifest(value: unknown): RuntimeManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Packaged runtime manifest is invalid.");
  }
  const manifest = value as Partial<RuntimeManifest>;
  if (
    manifest.schema !== 1 ||
    manifest.runtime !== "node" ||
    !manifest.node?.trim()
  ) {
    throw new Error("Packaged runtime manifest has an unsupported schema.");
  }
  if (!manifest.entry?.trim() || !manifest.acpEntry?.trim()) {
    throw new Error("Packaged runtime manifest has no runtime entrypoints.");
  }
  if (
    !manifest.thirdPartyNotices?.file?.trim() ||
    !inventoryIsStable(manifest.thirdPartyNotices?.packages) ||
    manifest.thirdPartyNotices.packages.length === 0 ||
    !/^[a-f0-9]{64}$/u.test(manifest.thirdPartyNotices.sha256 ?? "")
  ) {
    throw new Error(
      "Packaged runtime manifest has invalid third-party notices.",
    );
  }
  if (!isSortedUniqueStringList(manifest.assets)) {
    throw new Error(
      "Packaged runtime manifest has an invalid asset inventory.",
    );
  }
  if (
    !isSortedUniqueStringList(manifest.nativeEntryPackages) ||
    !isSortedUniqueStringList(manifest.nativePackages)
  ) {
    throw new Error(
      "Packaged runtime manifest has an invalid native package inventory.",
    );
  }
  if (
    !inventoryIsStable(manifest.bundledPackages) ||
    manifest.bundledPackages.length === 0 ||
    !inventoryIsStable(manifest.nativeExternalPackages) ||
    !inventoryIsStable(manifest.nativePackageClosure)
  ) {
    throw new Error(
      "Packaged runtime manifest has an invalid bundled dependency inventory.",
    );
  }
  if (
    !sameStringSet(
      inventoryNames(manifest.nativeExternalPackages),
      manifest.nativeEntryPackages,
    ) ||
    !sameStringSet(
      inventoryNames(manifest.nativePackageClosure),
      manifest.nativePackages,
    )
  ) {
    throw new Error(
      "Packaged runtime manifest native dependency inventory does not match copied packages.",
    );
  }
  const validated = manifest as RuntimeManifest;
  validateRuntimeDependencySecurityPolicy(validated);
  return validated;
}

export function verifyRuntimeManifestFile(path: string): RuntimeManifest {
  if (!existsSync(path)) {
    throw new Error(`Packaged runtime manifest is missing: ${path}`);
  }
  return validateRuntimeManifest(JSON.parse(readFileSync(path, "utf8")));
}

function runtimePath(runtimeBin: string, value: string): string {
  if (
    isAbsolute(value) ||
    relative(runtimeBin, resolve(runtimeBin, value)).startsWith("..")
  ) {
    throw new Error(
      `Packaged runtime manifest contains an unsafe path: ${value}`,
    );
  }
  return resolve(runtimeBin, value);
}

export function verifyPackagedNativeRuntime(appAsarPath: string): string[] {
  const runtimeBin = resolve(dirname(appAsarPath), "runtime", "bin");
  const runtimeManifestPath = resolve(runtimeBin, "runtime-manifest.json");
  if (!existsSync(runtimeManifestPath)) {
    throw new Error(
      `Packaged runtime manifest is missing: ${runtimeManifestPath}`,
    );
  }
  const runtimeManifest = verifyRuntimeManifestFile(runtimeManifestPath);
  const noticesPath = runtimePath(
    runtimeBin,
    runtimeManifest.thirdPartyNotices.file,
  );
  if (!existsSync(noticesPath) || !statSync(noticesPath).isFile()) {
    throw new Error(
      `Packaged runtime third-party notices are missing: ${noticesPath}`,
    );
  }
  const notices = readFileSync(noticesPath, "utf8");
  const noticesHash = createHash("sha256").update(notices).digest("hex");
  if (noticesHash !== runtimeManifest.thirdPartyNotices.sha256) {
    throw new Error(
      `Packaged runtime third-party notices were tampered with: ${noticesPath}`,
    );
  }
  for (const dependency of runtimeManifest.thirdPartyNotices.packages) {
    if (
      !notices.includes(`Package: ${dependency.name}\n`) ||
      !notices.includes(`Version: ${dependency.version}\n`) ||
      !notices.includes("Declared license: ") ||
      !notices.includes("License file: ")
    ) {
      throw new Error(
        `Packaged runtime third-party notices omit ${dependency.name}@${dependency.version}.`,
      );
    }
  }
  const runtimeEntry = runtimeManifest.entry;
  if (!existsSync(runtimePath(runtimeBin, runtimeEntry))) {
    throw new Error("Packaged runtime entry is missing.");
  }
  if (!existsSync(runtimePath(runtimeBin, runtimeManifest.acpEntry))) {
    throw new Error("Packaged ACP runtime entry is missing.");
  }
  const missingAssets = runtimeManifest.assets.filter(
    (asset) => !existsSync(runtimePath(runtimeBin, asset)),
  );
  if (missingAssets.length > 0) {
    throw new Error(
      `Packaged runtime assets are missing: ${missingAssets.join(", ")}`,
    );
  }
  const nativePackages = runtimeManifest.nativePackages;
  const runtimeRequire = createRequire(resolve(runtimeBin, runtimeEntry));
  const expectedNativePackages = new Map(
    runtimeManifest.nativePackageClosure.map((dependency) => [
      dependency.name,
      dependency.version,
    ]),
  );
  for (const packageName of nativePackages) {
    const manifestPath = runtimeRequire.resolve(`${packageName}/package.json`);
    const packagedManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    const packagedName =
      typeof packagedManifest.name === "string"
        ? packagedManifest.name
        : undefined;
    const packagedVersion =
      typeof packagedManifest.version === "string"
        ? packagedManifest.version
        : undefined;
    const expectedVersion = expectedNativePackages.get(packageName);
    if (packagedName !== packageName || packagedVersion !== expectedVersion) {
      throw new Error(
        `Packaged native package does not match runtime manifest: expected ${packageName}@${expectedVersion}, found ${packagedName ?? "(missing name)"}@${packagedVersion ?? "(missing version)"}.`,
      );
    }
  }
  for (const packageName of runtimeManifest.nativeEntryPackages) {
    runtimeRequire(packageName);
  }
  return nativePackages;
}

function verifyPackagedLicense(appAsarPath: string): void {
  const licensePath = resolve(dirname(appAsarPath), "LICENSE");
  if (!existsSync(licensePath) || !statSync(licensePath).isFile()) {
    throw new Error(`Packaged Doolittle license is missing: ${licensePath}`);
  }
  const license = readFileSync(licensePath, "utf8");
  if (!license.includes("MIT License") || !license.includes("SYMBaiEX")) {
    throw new Error(`Packaged Doolittle license is invalid: ${licensePath}`);
  }
}

export type CodeSignRunner = (command: string, args: string[]) => number | null;

type CodeSignMetadata = {
  status: number | null;
  output: string;
};

export type CodeSignInspector = (path: string) => CodeSignMetadata;

function filesBelow(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      files.push(...filesBelow(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function packagedRuntimeNativeCode(appBundlePath: string): string[] {
  const nodeModulesRoot = resolve(
    appBundlePath,
    "Contents/Resources/runtime/bin/node_modules",
  );
  return filesBelow(nodeModulesRoot).filter((path) => {
    const result = spawnSync("/usr/bin/file", ["--brief", path], {
      encoding: "utf8",
    });
    return result.status === 0 && result.stdout.trim().startsWith("Mach-O");
  });
}

function teamIdentifier(metadata: CodeSignMetadata, path: string): string {
  if (metadata.status !== 0) {
    throw new Error(`Unable to inspect macOS code signature for ${path}.`);
  }
  const identifier = metadata.output
    .match(/^TeamIdentifier=(.+)$/m)?.[1]
    ?.trim();
  if (!identifier || identifier === "not set") {
    throw new Error(`macOS code signature has no TeamIdentifier: ${path}.`);
  }
  return identifier;
}

export function verifyMacRuntimeNativeCodeTeam(
  appBundlePath: string,
  nativeCodePaths: string[] = packagedRuntimeNativeCode(appBundlePath),
  inspect: CodeSignInspector = (path) => {
    const result = spawnSync("codesign", ["-dvv", path], {
      encoding: "utf8",
    });
    return {
      status: result.status,
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    };
  },
): void {
  if (nativeCodePaths.length === 0) {
    throw new Error("Packaged macOS runtime has no native code to verify.");
  }
  const appTeam = teamIdentifier(inspect(appBundlePath), appBundlePath);
  for (const path of nativeCodePaths) {
    const nativeTeam = teamIdentifier(inspect(path), path);
    if (nativeTeam !== appTeam) {
      throw new Error(
        `macOS runtime native code TeamIdentifier mismatch: ${path} uses ${nativeTeam}, expected ${appTeam}.`,
      );
    }
  }
}

export function verifyMacCodeSignature(
  appBundlePath: string,
  run: CodeSignRunner = (command, commandArgs) =>
    spawnSync(command, commandArgs, { stdio: "inherit" }).status,
): void {
  const status = run("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appBundlePath,
  ]);
  if (status !== 0) {
    throw new Error(
      `macOS code signature verification failed for ${appBundlePath}.`,
    );
  }
}

function main(): void {
  const runtimeManifestPath = argumentValue("--runtime-manifest");
  if (runtimeManifestPath) {
    const manifest = verifyRuntimeManifestFile(resolve(runtimeManifestPath));
    console.log(
      `Desktop runtime dependency policy verified: ${manifest.bundledPackages.length} bundled package versions and ${manifest.nativePackageClosure.length} native package versions.`,
    );
    return;
  }
  const appBundlePath = argumentValue("--verify-signature");
  if (appBundlePath) {
    verifyMacCodeSignature(appBundlePath);
    verifyMacRuntimeNativeCodeTeam(appBundlePath);
    return;
  }
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
  verifyPackagedLicense(appAsarPath);
  const nativePackages = verifyPackagedNativeRuntime(appAsarPath);
  console.log(
    `Desktop package verified: ${(asarBytes / 1024 / 1024).toFixed(1)} MiB app.asar, ${packagedModules.length} packaged modules, ${allowedModules.length} allowed production modules, ${nativePackages.length} native runtime packages (limit ${(MAX_APP_ASAR_BYTES / 1024 / 1024).toFixed(0)} MiB).`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) main();
