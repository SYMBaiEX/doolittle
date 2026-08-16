#!/usr/bin/env nub

import { createHash } from "node:crypto";
import {
  createReadStream,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import {
  type NativePackageReceipt,
  nativeReceiptName,
} from "../apps/desktop/scripts/package-provenance";

const SHA256_SUMS = "SHA256SUMS.txt";
const RELEASE_MANIFEST = "release-manifest.json";
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;

export interface DesktopReleaseArtifact {
  path: string;
  platform: "linux" | "macos" | "release" | "windows";
  architecture: "all" | "arm64" | "x64";
  bytes: number;
  sha256: string;
}

export interface DesktopReleaseManifest {
  schemaVersion: 1;
  product: "Doolittle";
  version: string;
  tag: string;
  commit: string;
  generatedAt: string;
  artifacts: DesktopReleaseArtifact[];
}

interface ExpectedArtifact {
  path: string;
  platform: DesktopReleaseArtifact["platform"];
  architecture: DesktopReleaseArtifact["architecture"];
}

export interface CreateDesktopReleaseOptions {
  directory: string;
  version: string;
  tag: string;
  commit: string;
  generatedAt?: string;
}

const RECEIPT_PLATFORMS = ["linux", "macos", "windows"] as const;

function receiptArtifactPlatforms(
  platform: NativePackageReceipt["platform"],
): DesktopReleaseArtifact["platform"] {
  return platform;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

async function verifyNativePackageReceipts(
  directory: string,
  expected: ExpectedArtifact[],
  commit: string,
): Promise<void> {
  for (const platform of RECEIPT_PLATFORMS) {
    const receiptPath = resolve(directory, nativeReceiptName(platform));
    let receipt: NativePackageReceipt;
    try {
      receipt = JSON.parse(
        readFileSync(receiptPath, "utf8"),
      ) as NativePackageReceipt;
    } catch {
      throw new Error(
        `Missing or invalid native provenance receipt: ${nativeReceiptName(platform)}.`,
      );
    }
    if (
      receipt.schemaVersion !== 1 ||
      receipt.platform !== platform ||
      receipt.commit !== commit ||
      !isSha256(receipt.appAsar?.sha256) ||
      !receipt.appAsar.path ||
      !Number.isSafeInteger(receipt.appAsar.bytes) ||
      receipt.appAsar.bytes < 0
    ) {
      throw new Error(
        `Invalid native provenance receipt: ${nativeReceiptName(platform)}.`,
      );
    }
    const expectedPaths = expected
      .filter(
        (artifact) => artifact.platform === receiptArtifactPlatforms(platform),
      )
      .map((artifact) => artifact.path)
      .sort();
    const actualPaths = receipt.artifacts
      .map((artifact) => artifact.path)
      .sort();
    if (
      expectedPaths.join("\n") !== actualPaths.join("\n") ||
      new Set(actualPaths).size !== actualPaths.length
    ) {
      throw new Error(
        `Native provenance receipt does not bind the expected ${platform} artifacts.`,
      );
    }
    for (const artifact of receipt.artifacts) {
      const artifactPath = resolve(directory, artifact.path);
      if (
        !isSha256(artifact.sha256) ||
        !Number.isSafeInteger(artifact.bytes) ||
        artifact.bytes < 0 ||
        statSync(artifactPath).size !== artifact.bytes ||
        (await sha256(artifactPath)) !== artifact.sha256
      ) {
        throw new Error(
          `Native provenance receipt hash mismatch: ${nativeReceiptName(platform)} (${artifact.path}).`,
        );
      }
    }
  }
}

export function expectedDesktopReleaseArtifacts(
  version: string,
): ExpectedArtifact[] {
  const mac = `Doolittle-${version}-mac-arm64`;
  const windows = `Doolittle-${version}-win-x64.exe`;
  const linux = `Doolittle-${version}-linux-x64`;
  return [
    { path: "LICENSE", platform: "release", architecture: "all" },
    {
      path: nativeReceiptName("macos"),
      platform: "release",
      architecture: "all",
    },
    {
      path: nativeReceiptName("windows"),
      platform: "release",
      architecture: "all",
    },
    {
      path: nativeReceiptName("linux"),
      platform: "release",
      architecture: "all",
    },
    { path: `${mac}.dmg`, platform: "macos", architecture: "arm64" },
    {
      path: `${mac}.dmg.blockmap`,
      platform: "macos",
      architecture: "arm64",
    },
    { path: `${mac}.zip`, platform: "macos", architecture: "arm64" },
    {
      path: `${mac}.zip.blockmap`,
      platform: "macos",
      architecture: "arm64",
    },
    { path: "latest-mac.yml", platform: "macos", architecture: "arm64" },
    { path: windows, platform: "windows", architecture: "x64" },
    {
      path: `${windows}.blockmap`,
      platform: "windows",
      architecture: "x64",
    },
    { path: "latest.yml", platform: "windows", architecture: "x64" },
    { path: `${linux}.AppImage`, platform: "linux", architecture: "x64" },
    { path: `${linux}.deb`, platform: "linux", architecture: "x64" },
    { path: "latest-linux.yml", platform: "linux", architecture: "x64" },
  ];
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function sha512(path: string): Promise<string> {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("base64");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function yamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function yamlFields(source: string, name: string): string[] {
  const pattern = new RegExp(`^${escapeRegExp(name)}:\\s*(.+?)\\s*$`, "gmu");
  return [...source.matchAll(pattern)].map((match) => yamlScalar(match[1]));
}

function requireSingleYamlField(
  source: string,
  manifestName: string,
  name: string,
  expected?: string,
): string {
  const values = yamlFields(source, name);
  if (
    values.length !== 1 ||
    !values[0] ||
    (expected && values[0] !== expected)
  ) {
    throw new Error(
      `${manifestName} must contain one unambiguous ${name}${expected ? ` (${expected})` : ""}.`,
    );
  }
  return values[0];
}

interface UpdateManifestFileEntry {
  url: string[];
  sha512: string[];
  size: string[];
}

function updateManifestFileEntries(source: string): UpdateManifestFileEntry[] {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^files:\s*$/u.test(line));
  if (
    start < 0 ||
    lines.filter((line) => /^files:\s*$/u.test(line)).length !== 1
  ) {
    return [];
  }
  const entries: UpdateManifestFileEntry[] = [];
  let entry: UpdateManifestFileEntry | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/u.test(line)) break;
    const item = line.match(/^\s*-\s*(?:url:\s*(.*))?$/u);
    if (item) {
      entry = {
        url: item[1] === undefined ? [] : [yamlScalar(item[1])],
        sha512: [],
        size: [],
      };
      entries.push(entry);
      continue;
    }
    if (!entry) continue;
    const field = line.match(/^\s+(url|sha512|size):\s*(.+?)\s*$/u);
    if (field)
      entry[field[1] as "url" | "sha512" | "size"].push(yamlScalar(field[2]));
  }
  return entries;
}

async function verifyUpdateManifest(
  directory: string,
  manifestName: string,
  version: string,
  primaryArtifact: string,
): Promise<void> {
  const source = readFileSync(resolve(directory, manifestName), "utf8");
  try {
    requireSingleYamlField(source, manifestName, "version", version);
    requireSingleYamlField(source, manifestName, "path", primaryArtifact);
    const primarySha512 = requireSingleYamlField(
      source,
      manifestName,
      "sha512",
    );
    const matchingEntries = updateManifestFileEntries(source).filter(
      (entry) => entry.url.length === 1 && entry.url[0] === primaryArtifact,
    );
    if (matchingEntries.length !== 1) {
      throw new Error("one matching files entry");
    }
    const [entry] = matchingEntries;
    const fileSize = Number(entry.size[0]);
    if (
      entry.sha512.length !== 1 ||
      entry.size.length !== 1 ||
      !/^\d+$/u.test(entry.size[0]) ||
      !Number.isSafeInteger(fileSize)
    ) {
      throw new Error("one sha512 and size in the matching files entry");
    }
    const artifactPath = resolve(directory, primaryArtifact);
    const artifactSha512 = await sha512(artifactPath);
    const artifactSize = statSync(artifactPath).size;
    if (
      primarySha512 !== entry.sha512[0] ||
      primarySha512 !== artifactSha512 ||
      fileSize !== artifactSize
    ) {
      throw new Error("primary artifact sha512 or size mismatch");
    }
  } catch {
    throw new Error(
      `${manifestName} must structurally bind version ${version} to ${primaryArtifact}.`,
    );
  }
}

export async function createDesktopRelease(
  options: CreateDesktopReleaseOptions,
): Promise<DesktopReleaseManifest> {
  if (!SEMVER.test(options.version)) {
    throw new Error(`Invalid product version: ${options.version}`);
  }
  const expectedTag = `v${options.version}`;
  if (options.tag !== expectedTag) {
    throw new Error(`Release tag ${options.tag} must equal ${expectedTag}.`);
  }
  if (!COMMIT_SHA.test(options.commit)) {
    throw new Error(`Invalid release commit: ${options.commit}`);
  }

  const directory = resolve(options.directory);
  const expected = expectedDesktopReleaseArtifacts(options.version);
  const expectedNames = new Set(expected.map((artifact) => artifact.path));
  const actualEntries = readdirSync(directory, { withFileTypes: true }).filter(
    (entry) => entry.name !== SHA256_SUMS && entry.name !== RELEASE_MANIFEST,
  );
  const invalidEntries = actualEntries.filter(
    (entry) => !entry.isFile() || !expectedNames.has(entry.name),
  );
  const actualNames = new Set(actualEntries.map((entry) => entry.name));
  const missing = expected.filter(
    (artifact) => !actualNames.has(artifact.path),
  );
  if (missing.length > 0 || invalidEntries.length > 0) {
    const details = [
      missing.length > 0
        ? `missing: ${missing.map((artifact) => artifact.path).join(", ")}`
        : undefined,
      invalidEntries.length > 0
        ? `unexpected: ${invalidEntries.map((entry) => entry.name).join(", ")}`
        : undefined,
    ].filter(Boolean);
    throw new Error(
      `Invalid desktop release artifact set (${details.join("; ")}).`,
    );
  }

  const license = readFileSync(resolve(directory, "LICENSE"), "utf8");
  if (!license.includes("MIT License") || !license.includes("SYMBaiEX")) {
    throw new Error("Release LICENSE must contain Doolittle's MIT notice.");
  }

  await verifyUpdateManifest(
    directory,
    "latest-mac.yml",
    options.version,
    `Doolittle-${options.version}-mac-arm64.zip`,
  );
  await verifyUpdateManifest(
    directory,
    "latest.yml",
    options.version,
    `Doolittle-${options.version}-win-x64.exe`,
  );
  await verifyUpdateManifest(
    directory,
    "latest-linux.yml",
    options.version,
    `Doolittle-${options.version}-linux-x64.AppImage`,
  );
  await verifyNativePackageReceipts(directory, expected, options.commit);

  const artifacts: DesktopReleaseArtifact[] = [];
  for (const expectedArtifact of expected) {
    const path = resolve(directory, expectedArtifact.path);
    artifacts.push({
      ...expectedArtifact,
      bytes: statSync(path).size,
      sha256: await sha256(path),
    });
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new Error(`Invalid release generation timestamp: ${generatedAt}`);
  }
  const manifest: DesktopReleaseManifest = {
    schemaVersion: 1,
    product: "Doolittle",
    version: options.version,
    tag: options.tag,
    commit: options.commit,
    generatedAt,
    artifacts,
  };
  writeFileSync(
    resolve(directory, SHA256_SUMS),
    `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.path}`).join("\n")}\n`,
  );
  writeFileSync(
    resolve(directory, RELEASE_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required argument ${name}.`);
  }
  return value;
}

export async function main(): Promise<void> {
  const directory = requiredArgument("--directory");
  const manifest = await createDesktopRelease({
    directory,
    version: requiredArgument("--version"),
    tag: requiredArgument("--tag"),
    commit: requiredArgument("--commit"),
  });
  console.log(
    `Validated ${manifest.artifacts.length} ${manifest.product} ${manifest.version} release artifacts in ${basename(resolve(directory))}.`,
  );
}

if (import.meta.main) {
  await main();
}
