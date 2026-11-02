#!/usr/bin/env nub

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  expectedElizaPackageVersion,
  officialElizaDependencyVersion,
} from "./eliza-sdk-version-policy";
import {
  readElizaSourceBuilds,
  type SourceBuild,
  sourceBuildMatches,
  sourceTreeDigest,
  sourceWorkspaceDirectory,
} from "./eliza-source-policy";
import { findDoolittleWorkspaceVersionMismatch } from "./workspace-version-policy";

type PackageJson = {
  name?: string;
  version?: string;
  elizaSdk?: {
    channel?: string;
    sourceBuilds?: string;
    version?: string;
    packageVersions?: Record<string, string>;
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
  exports?: string | Record<string, unknown>;
  doolittleSourceBuild?: Partial<SourceBuild>;
};

const ROOT = process.cwd();
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "release",
]);

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function isOfficialElizaPackage(name: string): boolean {
  // npm/nub parent-scoped override keys use `parent>dependency` syntax and
  // are policy entries, not Eliza package manifests with an SDK version.
  return (
    !name.includes(">") && (name === "elizaos" || name.startsWith("@elizaos/"))
  );
}

function packageJsonPaths(directory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "package.json") {
      results.push(join(directory, entry.name));
      continue;
    }
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    results.push(...packageJsonPaths(join(directory, entry.name)));
  }
  return results;
}

const rootPackagePath = join(ROOT, "package.json");
const rootPackage = readPackageJson(rootPackagePath);
const sourceBuilds =
  rootPackage.elizaSdk?.sourceBuilds === "vendor/elizaos/source-builds.json"
    ? readElizaSourceBuilds(ROOT)
    : {};
const expectedVersion = rootPackage.elizaSdk?.version;
const expectedPackageVersion = (name: string) =>
  expectedElizaPackageVersion(
    name,
    expectedVersion ?? "",
    rootPackage.elizaSdk?.packageVersions,
  );
const productVersion = rootPackage.version;
const channel = rootPackage.elizaSdk?.channel;
if (!expectedVersion || channel !== "beta") {
  throw new Error(
    "package.json must declare elizaSdk.channel=beta and an exact elizaSdk.version.",
  );
}
if (!productVersion) {
  throw new Error(
    "package.json must declare a Doolittle product version independently of elizaSdk.version.",
  );
}

const packagePaths = [
  rootPackagePath,
  ...packageJsonPaths(join(ROOT, "packages")),
  ...packageJsonPaths(join(ROOT, "apps")),
];
const mismatches: string[] = [];
const externalPackages = new Set<string>();
const installedPackages = new Set<string>();
for (const [name, source] of Object.entries(sourceBuilds)) {
  const pin = `workspace:${source.version}`;
  if (rootPackage.dependencies?.[name] !== pin)
    mismatches.push(`Root source dependency ${name} must pin ${pin}`);
  installedPackages.add(name);
  if (
    sourceTreeDigest(join(ROOT, sourceWorkspaceDirectory(name))) !==
    source.treeSha256
  )
    mismatches.push(
      `Upstream SDK workspace ${name} differs from its qualified archive; run sdk:source:prepare.`,
    );
}
for (const path of packagePaths) {
  const manifest = readPackageJson(path);
  const relativePath = relative(ROOT, path).replaceAll("\\", "/");
  const workspaceVersionMismatch = findDoolittleWorkspaceVersionMismatch(
    manifest,
    productVersion,
  );
  if (workspaceVersionMismatch) {
    mismatches.push(
      `${relativePath} version=${workspaceVersionMismatch.actual}; expected ${workspaceVersionMismatch.expected}`,
    );
  }

  if (
    manifest.name &&
    isOfficialElizaPackage(manifest.name) &&
    path !== rootPackagePath
  ) {
    mismatches.push(
      `${relativePath} claims reserved SDK namespace ${manifest.name}; use the published package.`,
    );
  }

  for (const [section, dependencies] of Object.entries({
    dependencies: manifest.dependencies,
    devDependencies: manifest.devDependencies,
    optionalDependencies: manifest.optionalDependencies,
    overrides: manifest.overrides,
    peerDependencies: manifest.peerDependencies,
  })) {
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      if (section === "overrides" && version === "-") continue;
      if (
        isOfficialElizaPackage(name) &&
        typeof version === "string" &&
        version.startsWith("workspace:") &&
        version !== `workspace:${sourceBuilds[name]?.version}`
      )
        mismatches.push(
          `${relativePath} declares an unqualified SDK workspace ${name}=${version}`,
        );
      const declaredVersion = officialElizaDependencyVersion(name, version);
      if (!declaredVersion) {
        continue;
      }
      externalPackages.add(name);
      if (
        section === "dependencies" ||
        section === "devDependencies" ||
        section === "optionalDependencies"
      ) {
        installedPackages.add(name);
      }
      const source = sourceBuilds[name];
      const qualifiedSourcePin =
        source &&
        declaredVersion.startsWith("file:") &&
        resolve(dirname(path), declaredVersion.slice(5)) ===
          resolve(ROOT, source.artifact);
      if (
        !qualifiedSourcePin &&
        declaredVersion !== expectedPackageVersion(name)
      ) {
        mismatches.push(
          `${relative(ROOT, path)} ${section}.${name}=${declaredVersion}`,
        );
      }
    }
  }
}

for (const name of installedPackages) {
  const manifestPath = join(ROOT, "node_modules", name, "package.json");
  if (!existsSync(manifestPath)) {
    mismatches.push(`node_modules/${name} is not installed`);
    continue;
  }
  const installed = readPackageJson(manifestPath);
  const installedVersion = installed.version;
  const source = sourceBuilds[name];
  if (source && !sourceBuildMatches(source, installed)) {
    mismatches.push(
      `node_modules/${name} source provenance differs from its qualified archive`,
    );
  }
  if (installedVersion !== expectedPackageVersion(name)) {
    mismatches.push(
      `node_modules/${name}=${installedVersion ?? "unknown"} (installed)`,
    );
  }
}

if (mismatches.length > 0) {
  throw new Error(
    [
      `ElizaOS SDK release skew detected; expected ${expectedVersion}:`,
      ...mismatches.map((mismatch) => `- ${mismatch}`),
    ].join("\n"),
  );
}

console.log(
  `ElizaOS SDK verified: ${externalPackages.size} official packages with ${channel}@${expectedVersion} and explicit package exceptions; no local SDK compatibility packages.`,
);
