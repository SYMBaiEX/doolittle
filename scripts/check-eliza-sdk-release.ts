#!/usr/bin/env nub

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ELIZA_WORKSPACE_COMPATIBILITY } from "./eliza-workspace-compatibility";
import { findDoolittleWorkspaceVersionMismatch } from "./workspace-version-policy";

type PackageJson = {
  name?: string;
  version?: string;
  elizaSdk?: {
    channel?: string;
    version?: string;
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
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
const compatibilityByPath = new Map(
  ELIZA_WORKSPACE_COMPATIBILITY.map((entry) => [entry.packagePath, entry]),
);

for (const entry of ELIZA_WORKSPACE_COMPATIBILITY) {
  if (entry.upstreamVersion !== expectedVersion) {
    mismatches.push(
      `${entry.packagePath} compatibility registry upstreamVersion=${entry.upstreamVersion}`,
    );
  }
}

for (const path of packagePaths) {
  const manifest = readPackageJson(path);
  const relativePath = relative(ROOT, path);
  const compatibility = compatibilityByPath.get(relativePath);
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
    if (!compatibility) {
      mismatches.push(
        `${relativePath} claims the reserved ${manifest.name} namespace without a declared Eliza workspace compatibility boundary`,
      );
    }
    const allowedVersion = compatibility?.allowedVersion ?? expectedVersion;
    if (manifest.version !== allowedVersion) {
      mismatches.push(
        `${relativePath} package version=${manifest.version ?? "unknown"}; expected ${allowedVersion}`,
      );
    }
    if (compatibility && manifest.name !== compatibility.packageName) {
      mismatches.push(
        `${relativePath} package name=${manifest.name}; expected ${compatibility.packageName}`,
      );
    }
  }

  if (compatibility) {
    const packageExports =
      typeof manifest.exports === "string"
        ? { ".": manifest.exports }
        : (manifest.exports ?? {});
    for (const requiredExport of compatibility.requiredExports) {
      if (!Object.hasOwn(packageExports, requiredExport)) {
        mismatches.push(
          `${relativePath} is missing required compatibility export ${requiredExport}`,
        );
      }
    }
  }

  for (const [section, dependencies] of Object.entries({
    dependencies: manifest.dependencies,
    devDependencies: manifest.devDependencies,
    optionalDependencies: manifest.optionalDependencies,
    overrides: manifest.overrides,
    peerDependencies: manifest.peerDependencies,
  })) {
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      if (!isOfficialElizaPackage(name) || version.startsWith("workspace:")) {
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
      if (version !== expectedVersion) {
        mismatches.push(
          `${relative(ROOT, path)} ${section}.${name}=${version}`,
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
  if (installedVersion !== expectedVersion) {
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
  `ElizaOS SDK aligned: ${externalPackages.size} official packages on ${channel}@${expectedVersion}; ${ELIZA_WORKSPACE_COMPATIBILITY.length} workspace compatibility boundaries declared.`,
);
