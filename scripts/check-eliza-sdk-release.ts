#!/usr/bin/env nub

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  expectedElizaPackageVersion,
  officialElizaDependencyVersion,
} from "./eliza-sdk-version-policy";
import { findDoolittleWorkspaceVersionMismatch } from "./workspace-version-policy";

type PackageJson = {
  name?: string;
  version?: string;
  elizaSdk?: {
    channel?: string;
    version?: string;
    packageVersions?: Record<string, string>;
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
  exports?: string | Record<string, unknown>;
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
      if (declaredVersion !== expectedPackageVersion(name)) {
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
  const installedVersion = readPackageJson(manifestPath).version;
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
