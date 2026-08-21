import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Metafile } from "esbuild";

const DYNAMIC_COMMONJS_REQUIRE = /import\.meta\.url\)\("([^"]+)"\)/gu;
const RUNTIME_ASSET_REFERENCE =
  /new URL\(\s*["']\.\/([^"']+?\.(?:tar\.gz|wasm|data))["']\s*,\s*import\.meta\.url\s*\)/gu;

export type RuntimePackageManifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export type RuntimeDependencyInventoryEntry = {
  name: string;
  version: string;
};

export type RuntimeDependencyLicenseSource = RuntimeDependencyInventoryEntry & {
  directory: string;
};

type PackageLicenseManifest = RuntimeDependencyInventoryEntry & {
  license?: unknown;
  licenses?: unknown;
};

const STRONG_COPYLEFT_LICENSE = /(?:^|\b)(?:AGPL|GPL)-/iu;

// This package is published from the AI SDK monorepo without its own license
// text. Its sibling provider package carries the same Apache-2.0 repository
// license; pinning this exception to the reviewed published version prevents
// future versions from inheriting it without an explicit review.
const REVIEWED_SHARED_LICENSE_FILES: Readonly<Record<string, string>> = {
  "@ai-sdk/provider-utils@4.0.46": "../provider/LICENSE",
  "@lydell/node-pty-darwin-arm64@1.1.0": "../node-pty/LICENSE",
};

// Canonical GNU GPL v3 text, checked in from the official license text. The
// local ffmpeg-static copy was only the source for this one-time repository
// addition; runtime preparation never reads legal text from node_modules.
const CHECKED_IN_LICENSE_ASSETS: Readonly<Record<string, string>> = {
  "adapter-types@0.2.1": fileURLToPath(
    new URL("./licenses/MIT.txt", import.meta.url),
  ),
  "@snazzah/davey@0.1.12": fileURLToPath(
    new URL("./licenses/MIT.txt", import.meta.url),
  ),
  "@snazzah/davey-darwin-arm64@0.1.12": fileURLToPath(
    new URL("./licenses/MIT.txt", import.meta.url),
  ),
  "@sapphire/async-queue@1.5.5": fileURLToPath(
    new URL("./licenses/MIT.txt", import.meta.url),
  ),
  "@sapphire/snowflake@3.5.5": fileURLToPath(
    new URL("./licenses/MIT.txt", import.meta.url),
  ),
  "@puppeteer/browsers@3.2.1": fileURLToPath(
    new URL("./licenses/Apache-2.0.txt", import.meta.url),
  ),
  "@cryptography/aes@0.1.1": fileURLToPath(
    new URL("./licenses/GPL-3.0.txt", import.meta.url),
  ),
};

// Standard SPDX identifiers have canonical license texts. A published package
// that declares one of these identifiers may use the checked-in canonical text
// when its npm `files` allowlist omits the repository license file.
const CHECKED_IN_SPDX_LICENSE_ASSETS: Readonly<Record<string, string>> = {
  MIT: fileURLToPath(new URL("./licenses/MIT.txt", import.meta.url)),
  "Apache-2.0": fileURLToPath(
    new URL("./licenses/Apache-2.0.txt", import.meta.url),
  ),
  "GPL-3.0-or-later": fileURLToPath(
    new URL("./licenses/GPL-3.0.txt", import.meta.url),
  ),
};

const REVIEWED_SHARED_LICENSE_PACKAGE_PREFIXES = ["@elizaos/"] as const;
const REVIEWED_ELIZAOS_LICENSE_VERSION = "2.0.3-beta.7";

function declaredLicense(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    (value as { type: string }).type.trim()
  ) {
    return (value as { type: string }).type.trim();
  }
  return undefined;
}

function licenseFile(
  directory: string,
  packageKey: string,
  metadataLicense: string | undefined,
): { displayName: string; path: string } | undefined {
  const localName = readdirSync(directory)
    .filter((name) => /^licen[cs]e(?:\..+)?$/iu.test(name))
    .sort((left, right) => left.localeCompare(right))[0];
  if (localName) {
    return { displayName: localName, path: resolve(directory, localName) };
  }
  const packageIdentity = packageKey.replace("\u0000", "@");
  const checkedInAsset = CHECKED_IN_LICENSE_ASSETS[packageIdentity];
  if (checkedInAsset) {
    return {
      displayName: `${checkedInAsset.split("/").at(-1)} (checked-in canonical license text)`,
      path: checkedInAsset,
    };
  }
  const spdxAsset = metadataLicense
    ? CHECKED_IN_SPDX_LICENSE_ASSETS[metadataLicense]
    : undefined;
  if (spdxAsset) {
    return {
      displayName: `${spdxAsset.split("/").at(-1)} (checked-in canonical SPDX text)`,
      path: spdxAsset,
    };
  }
  const reviewedPath =
    REVIEWED_SHARED_LICENSE_FILES[packageIdentity] ??
    (REVIEWED_SHARED_LICENSE_PACKAGE_PREFIXES.some((prefix) =>
      packageIdentity.startsWith(prefix),
    ) && packageIdentity.endsWith(`@${REVIEWED_ELIZAOS_LICENSE_VERSION}`)
      ? "../core/LICENSE"
      : undefined);
  return reviewedPath
    ? { displayName: reviewedPath, path: resolve(directory, reviewedPath) }
    : undefined;
}

/**
 * Writes the third-party notices for exactly the dependency inventory that is
 * emitted into the packaged runtime. This deliberately takes source directories
 * from the bundler/copy closure rather than resolving the broader dev graph.
 */
export function writeRuntimeThirdPartyNotices(
  path: string,
  inventory: readonly RuntimeDependencyInventoryEntry[],
  sources: readonly RuntimeDependencyLicenseSource[],
): void {
  const sourcesByPackage = new Map<string, RuntimeDependencyLicenseSource>();
  for (const source of sources) {
    const key = `${source.name}\u0000${source.version}`;
    if (!sourcesByPackage.has(key)) sourcesByPackage.set(key, source);
  }

  const notices = stableRuntimeDependencyInventory(inventory).map(
    (dependency) => {
      const key = `${dependency.name}\u0000${dependency.version}`;
      const source = sourcesByPackage.get(key);
      if (!source) {
        throw new Error(
          `Runtime notice source is missing for ${dependency.name}@${dependency.version}.`,
        );
      }
      const manifestPath = resolve(source.directory, "package.json");
      const manifest = JSON.parse(
        readFileSync(manifestPath, "utf8"),
      ) as PackageLicenseManifest;
      if (
        manifest.name !== dependency.name ||
        manifest.version !== dependency.version
      ) {
        throw new Error(
          `Runtime notice source does not match ${dependency.name}@${dependency.version}: ${manifestPath}`,
        );
      }
      const metadataLicense =
        declaredLicense(manifest.license) ??
        declaredLicense(
          Array.isArray(manifest.licenses) ? manifest.licenses[0] : undefined,
        );
      const licenseFileEntry = licenseFile(
        source.directory,
        key,
        metadataLicense,
      );
      if (!licenseFileEntry) {
        throw new Error(
          `Runtime package has no license text file: ${manifestPath}`,
        );
      }
      const filePath = licenseFileEntry.path;
      if (!existsSync(filePath)) {
        throw new Error(`Runtime package license text is missing: ${filePath}`);
      }
      let text: string;
      try {
        text = readFileSync(filePath, "utf8");
      } catch (error) {
        throw new Error(
          `Runtime package license text is unreadable: ${filePath}`,
          {
            cause: error,
          },
        );
      }
      if (!text.trim()) {
        throw new Error(`Runtime package license text is empty: ${filePath}`);
      }
      const resolvedLicense =
        metadataLicense ??
        (/^(?:The )?MIT License\b/u.test(text) ||
        text.includes(
          "Permission is hereby granted, free of charge, to any person obtaining a copy",
        )
          ? "MIT"
          : undefined);
      if (!resolvedLicense) {
        throw new Error(
          `Runtime package has no declared or identifiable license: ${manifestPath}`,
        );
      }
      return [
        "--------------------------------------------------------------------------------",
        `Package: ${dependency.name}`,
        `Version: ${dependency.version}`,
        `Declared license: ${resolvedLicense}`,
        `License file: ${licenseFileEntry.displayName}`,
        "",
        text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trimEnd(),
        "",
      ].join("\n");
    },
  );
  writeFileSync(
    path,
    [
      "Doolittle packaged runtime third-party notices",
      "",
      "This file is generated from the packaged runtime dependency inventory.",
      "",
      ...notices,
    ].join("\n"),
    "utf8",
  );
}

/**
 * The desktop runtime is emitted as a single bundled work. Fail closed when a
 * contributing package declares a strong-copyleft license that is not
 * compatible with Doolittle's MIT binary distribution. Source installs may
 * still load those optional packages under their own license terms.
 */
export function assertDesktopDistributionLicensePolicy(
  inventory: readonly RuntimeDependencyInventoryEntry[],
  sources: readonly RuntimeDependencyLicenseSource[],
): void {
  const sourcesByPackage = new Map(
    sources.map(
      (source) => [`${source.name}\u0000${source.version}`, source] as const,
    ),
  );
  for (const dependency of stableRuntimeDependencyInventory(inventory)) {
    const source = sourcesByPackage.get(
      `${dependency.name}\u0000${dependency.version}`,
    );
    if (!source) continue;
    const manifestPath = resolve(source.directory, "package.json");
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as PackageLicenseManifest;
    const license =
      declaredLicense(manifest.license) ??
      declaredLicense(
        Array.isArray(manifest.licenses) ? manifest.licenses[0] : undefined,
      );
    if (license && STRONG_COPYLEFT_LICENSE.test(license)) {
      throw new Error(
        `Packaged desktop runtime cannot bundle strong-copyleft dependency ${dependency.name}@${dependency.version} (${license}).`,
      );
    }
  }
}

/**
 * Returns only inputs that contribute bytes to at least one emitted output.
 * Esbuild's top-level `inputs` includes discovered-but-tree-shaken modules, so
 * it is not an artifact inventory on its own.
 */
export function emittedMetafileInputPaths(
  metafile: Pick<Metafile, "outputs">,
): string[] {
  const bytesByInput = new Map<string, number>();
  for (const output of Object.values(metafile.outputs)) {
    for (const [inputPath, input] of Object.entries(output.inputs ?? {})) {
      bytesByInput.set(
        inputPath,
        (bytesByInput.get(inputPath) ?? 0) + input.bytesInOutput,
      );
    }
  }
  return [...bytesByInput]
    .filter(([, bytesInOutput]) => bytesInOutput > 0)
    .map(([inputPath]) => inputPath)
    .sort();
}

/**
 * Produces a deterministic, duplicate-free dependency inventory suitable for
 * release artifacts. Keeping this independent from esbuild makes the manifest
 * format easy to validate without running a bundler or reaching the network.
 */
export function stableRuntimeDependencyInventory(
  packages: Iterable<RuntimeDependencyInventoryEntry>,
): RuntimeDependencyInventoryEntry[] {
  const versionsByPackage = new Set<string>();
  const inventory: RuntimeDependencyInventoryEntry[] = [];
  for (const entry of packages) {
    const name = entry.name.trim();
    const version = entry.version.trim();
    if (!name || !version) {
      throw new Error(
        "Runtime dependency inventory entries require a name and version.",
      );
    }
    const key = `${name}\u0000${version}`;
    if (versionsByPackage.has(key)) continue;
    versionsByPackage.add(key);
    inventory.push({ name, version });
  }
  return inventory.sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.version.localeCompare(right.version),
  );
}

export function discoverDynamicCommonJsPackages(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(DYNAMIC_COMMONJS_REQUIRE)]
        .map((match) => match[1]?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort();
}

export function discoverRuntimeAssetReferences(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(RUNTIME_ASSET_REFERENCE)]
        .map((match) => match[1]?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort();
}

export function runtimePackageClosure(
  rootPackages: readonly string[],
  manifests: ReadonlyMap<string, RuntimePackageManifest | undefined>,
): string[] {
  const packages = new Set<string>();
  const pending = [...rootPackages];
  while (pending.length > 0) {
    const packageName = pending.pop();
    if (!packageName || packages.has(packageName)) continue;
    packages.add(packageName);
    const manifest = manifests.get(packageName);
    pending.push(
      ...Object.keys(manifest?.dependencies ?? {}),
      ...Object.keys(manifest?.optionalDependencies ?? {}),
    );
  }
  return [...packages].sort();
}
