import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type DesktopBuildInventory,
  type DesktopInventoryPackage,
  validateDesktopBuildInventory,
} from "./desktop-build-inventory";
import {
  assertDesktopDistributionLicensePolicy,
  type RuntimeDependencyInventoryEntry,
  type RuntimeDependencyLicenseSource,
  runtimeThirdPartyNoticesText,
  stableRuntimeDependencyInventory,
} from "./runtime-requirements";

const defaultDesktopRoot = fileURLToPath(new URL("..", import.meta.url));
const defaultRepoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export const DESKTOP_ARTIFACT_FILES = [
  "desktop-artifact-manifest.json",
  "THIRD-PARTY-NOTICES.txt",
  "LICENSE.electron.txt",
  "LICENSES.chromium.html",
] as const;

export type DesktopArtifactDependency = RuntimeDependencyInventoryEntry;

export type DesktopArtifactManifest = {
  schemaVersion: 1;
  desktop: { name: "@doolittle/desktop"; version: string };
  electron: { name: "electron"; version: string };
  surfaces: DesktopBuildInventory[];
  appAsar: { productionPackages: DesktopArtifactDependency[] };
  runtime: {
    manifest: { path: "runtime/bin/runtime-manifest.json"; sha256: string };
    packages: DesktopArtifactDependency[];
  };
  dependencies: DesktopArtifactDependency[];
  legal: Array<{ path: string; bytes: number; sha256: string }>;
};

type PackageManifest = {
  name?: unknown;
  version?: unknown;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type RuntimeManifest = {
  bundledPackages?: DesktopArtifactDependency[];
  nativePackageClosure?: DesktopArtifactDependency[];
  thirdPartyNotices?: { file?: string; sha256?: string };
};

type AuditFinding = { version?: unknown };
type AuditAdvisory = {
  severity?: unknown;
  module_name?: unknown;
  name?: unknown;
  findings?: unknown;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path: string): unknown {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Desktop artifact input is missing: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Desktop artifact JSON is invalid: ${path}`, {
      cause: error,
    });
  }
}

function packageIdentity(path: string): {
  manifest: PackageManifest & { name: string; version: string };
  directory: string;
} {
  const manifest = readJson(path) as PackageManifest;
  if (
    typeof manifest.name !== "string" ||
    !manifest.name ||
    typeof manifest.version !== "string" ||
    !manifest.version
  ) {
    throw new Error(`Desktop package identity is invalid: ${path}`);
  }
  return {
    manifest: manifest as PackageManifest & { name: string; version: string },
    directory: dirname(path),
  };
}

function resolveManifest(resolver: NodeRequire, packageName: string): string {
  try {
    return resolver.resolve(`${packageName}/package.json`);
  } catch (error) {
    throw new Error(
      `Desktop artifact package cannot be resolved: ${packageName}`,
      {
        cause: error,
      },
    );
  }
}

export function installedDesktopProductionPackages(desktopRoot: string): {
  inventory: DesktopArtifactDependency[];
  sources: RuntimeDependencyLicenseSource[];
} {
  const rootPath = resolve(desktopRoot, "package.json");
  const root = packageIdentity(rootPath).manifest;
  const pending = Object.keys(root.dependencies ?? {}).map((name) => ({
    name,
    resolver: createRequire(rootPath),
  }));
  const identities = new Map<string, RuntimeDependencyLicenseSource>();
  const visitedManifests = new Set<string>();
  while (pending.length > 0) {
    const next = pending.pop();
    if (!next) continue;
    const manifestPath = resolveManifest(next.resolver, next.name);
    if (visitedManifests.has(manifestPath)) continue;
    visitedManifests.add(manifestPath);
    const identity = packageIdentity(manifestPath);
    if (identity.manifest.name !== next.name) {
      throw new Error(
        `Resolved desktop package does not match ${next.name}: ${manifestPath}`,
      );
    }
    identities.set(`${identity.manifest.name}\0${identity.manifest.version}`, {
      name: identity.manifest.name,
      version: identity.manifest.version,
      directory: identity.directory,
    });
    const childResolver = createRequire(manifestPath);
    for (const name of Object.keys(identity.manifest.dependencies ?? {})) {
      pending.push({ name, resolver: childResolver });
    }
    for (const name of Object.keys(
      identity.manifest.optionalDependencies ?? {},
    )) {
      try {
        resolveManifest(childResolver, name);
        pending.push({ name, resolver: childResolver });
      } catch {
        // A platform-specific optional dependency is absent from this package.
      }
    }
  }
  const sources = [...identities.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.version.localeCompare(right.version),
  );
  return { inventory: stableRuntimeDependencyInventory(sources), sources };
}

function installedPackageSourceIndex(
  repoRoot: string,
): Map<string, RuntimeDependencyLicenseSource> {
  const sources = new Map<string, RuntimeDependencyLicenseSource>();
  for (const relativePath of globSync("node_modules/**/package.json", {
    cwd: repoRoot,
  }).sort()) {
    const path = resolve(repoRoot, relativePath);
    let identity: ReturnType<typeof packageIdentity>;
    try {
      identity = packageIdentity(path);
    } catch {
      // Package managers may retain metadata-only package.json files which are
      // not installable package identities. They cannot satisfy an emitted
      // module inventory entry.
      continue;
    }
    const key = `${identity.manifest.name}\0${identity.manifest.version}`;
    if (!sources.has(key)) {
      sources.set(key, {
        name: identity.manifest.name,
        version: identity.manifest.version,
        directory: identity.directory,
      });
    }
  }
  return sources;
}

function exactPackageSource(
  desktopRoot: string,
  sourceIndex: ReadonlyMap<string, RuntimeDependencyLicenseSource>,
  dependency: DesktopArtifactDependency,
): RuntimeDependencyLicenseSource {
  const candidates = new Set<string>();
  const resolver = createRequire(resolve(desktopRoot, "package.json"));
  try {
    candidates.add(resolveManifest(resolver, dependency.name));
  } catch {
    // Nested versions may not be addressable from the desktop root.
  }
  const matches = [...candidates]
    .sort()
    .map((path) => packageIdentity(path))
    .filter(
      (identity) =>
        identity.manifest.name === dependency.name &&
        identity.manifest.version === dependency.version,
    );
  const match = matches[0];
  const indexed = sourceIndex.get(`${dependency.name}\0${dependency.version}`);
  if (!match && indexed) return indexed;
  if (!match) {
    throw new Error(
      `Desktop emitted package source is missing: ${dependency.name}@${dependency.version}.`,
    );
  }
  return { ...dependency, directory: match.directory };
}

function stableSurfacePackages(
  surfaces: readonly DesktopBuildInventory[],
): DesktopInventoryPackage[] {
  return [
    ...new Map(
      surfaces
        .flatMap((surface) => surface.packages)
        .map((entry) => [`${entry.name}\0${entry.version}`, entry]),
    ).values(),
  ].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.version.localeCompare(right.version),
  );
}

function isFirstParty(name: string): boolean {
  return name.startsWith("@doolittle/") || name === "doolittle";
}

export function assertDesktopArtifactAuditReport(
  value: unknown,
  dependencies: readonly DesktopArtifactDependency[],
): void {
  if (typeof value !== "object" || value === null) {
    throw new Error("Desktop dependency audit JSON is invalid.");
  }
  const report = value as { advisories?: unknown; vulnerabilities?: unknown };
  const shipped = new Map(
    dependencies.map(
      (dependency) => [dependency.name, new Set<string>()] as const,
    ),
  );
  for (const dependency of dependencies)
    shipped.get(dependency.name)?.add(dependency.version);
  const affected: string[] = [];
  if (report.advisories && typeof report.advisories === "object") {
    for (const advisory of Object.values(
      report.advisories as Record<string, AuditAdvisory>,
    )) {
      if (advisory.severity !== "high" && advisory.severity !== "critical")
        continue;
      const name =
        typeof advisory.module_name === "string"
          ? advisory.module_name
          : typeof advisory.name === "string"
            ? advisory.name
            : undefined;
      if (!name || !shipped.has(name)) continue;
      if (!Array.isArray(advisory.findings)) {
        throw new Error(
          `Desktop audit finding schema is invalid for shipped package ${name}.`,
        );
      }
      const findings = advisory.findings as AuditFinding[];
      if (
        findings.length === 0 ||
        findings.some((finding) =>
          typeof finding.version !== "string"
            ? true
            : shipped.get(name)?.has(finding.version),
        )
      ) {
        affected.push(name);
      }
    }
  } else if (
    report.vulnerabilities &&
    typeof report.vulnerabilities === "object"
  ) {
    for (const [name, vulnerability] of Object.entries(
      report.vulnerabilities as Record<string, { severity?: unknown }>,
    )) {
      if (
        shipped.has(name) &&
        (vulnerability.severity === "high" ||
          vulnerability.severity === "critical")
      ) {
        affected.push(name);
      }
    }
  } else {
    throw new Error("Desktop dependency audit JSON has an unsupported schema.");
  }
  if (affected.length > 0) {
    throw new Error(
      `Desktop artifact contains high/critical audited dependencies: ${[...new Set(affected)].sort().join(", ")}.`,
    );
  }
}

function runDesktopAudit(repoRoot: string): unknown {
  const result = spawnSync(
    "nub",
    ["audit", "--audit-level", "high", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (!result.stdout.trim()) {
    throw new Error(
      `Desktop dependency audit produced no JSON.${result.stderr.trim() ? ` ${result.stderr.trim()}` : ""}`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error("Desktop dependency audit produced invalid JSON.", {
      cause: error,
    });
  }
}

function electronSources(desktopRoot: string): {
  version: string;
  license: string;
  chromiumLicenses: string;
} {
  const resolver = createRequire(resolve(desktopRoot, "package.json"));
  const manifestPath = resolveManifest(resolver, "electron");
  const identity = packageIdentity(manifestPath);
  const license = resolve(identity.directory, "LICENSE");
  const distribution = process.env.ELECTRON_OVERRIDE_DIST_PATH?.trim()
    ? resolve(process.env.ELECTRON_OVERRIDE_DIST_PATH)
    : resolve(identity.directory, "dist");
  const chromiumLicenses = resolve(distribution, "LICENSES.chromium.html");
  const distributionVersion = resolve(distribution, "version");
  for (const path of [license, chromiumLicenses, distributionVersion]) {
    if (
      !existsSync(path) ||
      !statSync(path).isFile() ||
      statSync(path).size === 0
    ) {
      throw new Error(
        `Required Electron distribution legal asset is missing: ${path}`,
      );
    }
  }
  const packagedElectronVersion = readFileSync(
    distributionVersion,
    "utf8",
  ).trim();
  if (packagedElectronVersion !== identity.manifest.version) {
    throw new Error(
      `Electron distribution version mismatch: expected ${identity.manifest.version}, found ${packagedElectronVersion || "(empty)"} in ${distributionVersion}.`,
    );
  }
  return { version: identity.manifest.version, license, chromiumLicenses };
}

function legalEntry(
  root: string,
  path: string,
): { path: string; bytes: number; sha256: string } {
  const absolute = resolve(root, path);
  return {
    path: relative(root, absolute).replaceAll("\\", "/"),
    bytes: statSync(absolute).size,
    sha256: sha256(readFileSync(absolute)),
  };
}

export function validateDesktopArtifactManifest(
  value: unknown,
): DesktopArtifactManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Desktop artifact manifest is invalid.");
  }
  const manifest = value as Partial<DesktopArtifactManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.desktop?.name !== "@doolittle/desktop" ||
    !manifest.desktop.version ||
    manifest.electron?.name !== "electron" ||
    !manifest.electron.version ||
    !Array.isArray(manifest.surfaces) ||
    manifest.surfaces.map((surface) => surface.surface).join(",") !==
      "main,preload,renderer" ||
    !Array.isArray(manifest.appAsar?.productionPackages) ||
    !Array.isArray(manifest.runtime?.packages) ||
    manifest.runtime?.manifest?.path !== "runtime/bin/runtime-manifest.json" ||
    !/^[a-f0-9]{64}$/u.test(manifest.runtime?.manifest?.sha256 ?? "") ||
    !Array.isArray(manifest.dependencies) ||
    !Array.isArray(manifest.legal) ||
    manifest.legal.map((entry) => entry.path).join(",") !==
      "LICENSE.electron.txt,LICENSES.chromium.html,THIRD-PARTY-NOTICES.txt"
  ) {
    throw new Error("Desktop artifact manifest is invalid or unstable.");
  }
  for (const entry of manifest.legal) {
    if (entry.bytes <= 0 || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      throw new Error("Desktop artifact legal inventory is invalid.");
    }
  }
  for (const surface of manifest.surfaces) {
    if (
      surface.schemaVersion !== 1 ||
      !Array.isArray(surface.outputs) ||
      surface.outputs.length === 0 ||
      !Array.isArray(surface.packages) ||
      surface.outputs.some(
        (entry, index) =>
          !entry.path ||
          entry.bytes <= 0 ||
          !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
          (index > 0 &&
            (surface.outputs[index - 1]?.path.localeCompare(entry.path) ?? 0) >=
              0),
      )
    ) {
      throw new Error(
        `Desktop ${surface.surface} build inventory is invalid or unstable.`,
      );
    }
    const stablePackages = [...surface.packages].sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.version.localeCompare(right.version),
    );
    if (
      stablePackages.some(
        (entry, index) =>
          entry.name !== surface.packages[index]?.name ||
          entry.version !== surface.packages[index]?.version,
      )
    ) {
      throw new Error(
        `Desktop ${surface.surface} package inventory is unstable.`,
      );
    }
  }
  for (const inventory of [
    manifest.appAsar.productionPackages,
    manifest.runtime.packages,
    manifest.dependencies,
  ]) {
    const stable = stableRuntimeDependencyInventory(inventory);
    if (
      stable.length !== inventory.length ||
      stable.some(
        (entry, index) =>
          entry.name !== inventory[index]?.name ||
          entry.version !== inventory[index]?.version,
      )
    ) {
      throw new Error("Desktop artifact dependency inventory is unstable.");
    }
  }
  const expectedDependencies = stableRuntimeDependencyInventory(
    [
      ...manifest.surfaces.flatMap((surface) => surface.packages),
      ...manifest.appAsar.productionPackages,
      ...manifest.runtime.packages,
      manifest.electron,
    ].filter((dependency) => !isFirstParty(dependency.name)),
  );
  const dependencies = manifest.dependencies as DesktopArtifactDependency[];
  if (
    expectedDependencies.length !== dependencies.length ||
    expectedDependencies.some(
      (entry, index) =>
        entry.name !== dependencies[index]?.name ||
        entry.version !== dependencies[index]?.version,
    )
  ) {
    throw new Error(
      "Desktop artifact merged dependency inventory is incomplete.",
    );
  }
  return manifest as DesktopArtifactManifest;
}

export function prepareDesktopArtifact({
  desktopRoot = defaultDesktopRoot,
  repoRoot = defaultRepoRoot,
  auditReport,
}: {
  desktopRoot?: string;
  repoRoot?: string;
  auditReport?: unknown;
} = {}): DesktopArtifactManifest {
  const outputRoot = resolve(desktopRoot, "build/desktop-artifact");
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });
  const surfaces = (["main", "preload", "renderer"] as const).map((surface) => {
    const inventoryPath = resolve(
      desktopRoot,
      "build/desktop-inventory",
      `${surface}.json`,
    );
    const distRoot = resolve(desktopRoot, "dist", surface);
    return validateDesktopBuildInventory(
      readJson(inventoryPath),
      surface,
      distRoot,
    );
  });
  const desktop = packageIdentity(
    resolve(desktopRoot, "package.json"),
  ).manifest;
  const runtimeManifestPath = resolve(
    desktopRoot,
    "build/runtime/runtime-manifest.json",
  );
  const runtimeManifest = readJson(runtimeManifestPath) as RuntimeManifest;
  if (
    !Array.isArray(runtimeManifest.bundledPackages) ||
    runtimeManifest.bundledPackages.length === 0 ||
    !Array.isArray(runtimeManifest.nativePackageClosure) ||
    !runtimeManifest.thirdPartyNotices?.file ||
    !/^[a-f0-9]{64}$/u.test(runtimeManifest.thirdPartyNotices.sha256 ?? "")
  ) {
    throw new Error("Desktop runtime inventory is missing or stale.");
  }
  const runtimeNoticesPath = resolve(
    desktopRoot,
    "build/runtime",
    runtimeManifest.thirdPartyNotices.file,
  );
  const runtimeNotices = readFileSync(runtimeNoticesPath, "utf8");
  if (sha256(runtimeNotices) !== runtimeManifest.thirdPartyNotices.sha256) {
    throw new Error("Desktop runtime notices are stale or tampered with.");
  }
  const production = installedDesktopProductionPackages(desktopRoot);
  // Resolve both distinct Electron legal sources before any network-backed
  // audit so a partial/cached Electron install fails with an actionable local
  // prerequisite instead of doing unrelated release work first.
  const electron = electronSources(desktopRoot);
  const surfacePackages = stableSurfacePackages(surfaces).filter(
    (dependency) => !isFirstParty(dependency.name),
  );
  const runtimePackages = stableRuntimeDependencyInventory([
    ...runtimeManifest.bundledPackages,
    ...runtimeManifest.nativePackageClosure,
  ]);
  const dependencies = stableRuntimeDependencyInventory(
    [
      ...surfacePackages,
      ...production.inventory,
      ...runtimePackages,
      { name: "electron", version: electron.version },
    ].filter((dependency) => !isFirstParty(dependency.name)),
  );
  assertDesktopArtifactAuditReport(
    auditReport ?? runDesktopAudit(repoRoot),
    dependencies,
  );

  const runtimeKeys = new Set(
    runtimePackages.map((entry) => `${entry.name}\0${entry.version}`),
  );
  const productionSources = new Map(
    production.sources.map((source) => [
      `${source.name}\0${source.version}`,
      source,
    ]),
  );
  const installedSources = installedPackageSourceIndex(repoRoot);
  const noticeDependencies = dependencies.filter(
    (entry) =>
      !runtimeKeys.has(`${entry.name}\0${entry.version}`) &&
      entry.name !== "electron",
  );
  const noticeSources = noticeDependencies.map(
    (dependency) =>
      productionSources.get(`${dependency.name}\0${dependency.version}`) ??
      exactPackageSource(desktopRoot, installedSources, dependency),
  );
  assertDesktopDistributionLicensePolicy(noticeDependencies, noticeSources);
  const nonRuntimeNotices = runtimeThirdPartyNoticesText(
    noticeDependencies,
    noticeSources,
    "Doolittle desktop shell third-party notices",
  );
  writeFileSync(
    resolve(outputRoot, "THIRD-PARTY-NOTICES.txt"),
    `${nonRuntimeNotices.trimEnd()}\n\n${runtimeNotices.trimEnd()}\n`,
    "utf8",
  );
  copyFileSync(electron.license, resolve(outputRoot, "LICENSE.electron.txt"));
  copyFileSync(
    electron.chromiumLicenses,
    resolve(outputRoot, "LICENSES.chromium.html"),
  );
  const legal = [
    "LICENSE.electron.txt",
    "LICENSES.chromium.html",
    "THIRD-PARTY-NOTICES.txt",
  ].map((path) => legalEntry(outputRoot, path));
  const manifest: DesktopArtifactManifest = {
    schemaVersion: 1,
    desktop: { name: "@doolittle/desktop", version: desktop.version },
    electron: { name: "electron", version: electron.version },
    surfaces,
    appAsar: { productionPackages: production.inventory },
    runtime: {
      manifest: {
        path: "runtime/bin/runtime-manifest.json",
        sha256: sha256(readFileSync(runtimeManifestPath)),
      },
      packages: runtimePackages,
    },
    dependencies,
    legal,
  };
  validateDesktopArtifactManifest(manifest);
  writeFileSync(
    resolve(outputRoot, "desktop-artifact-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

if (import.meta.main) {
  const manifest = prepareDesktopArtifact();
  console.log(
    `Prepared complete desktop artifact inventory with ${manifest.dependencies.length} dependencies.`,
  );
}
