import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type DesktopArtifactDependency,
  validateDesktopArtifactManifest,
} from "./desktop-artifact";

export type DesktopSbomPlatform = "linux" | "macos" | "windows";

type SpdxPackage = {
  SPDXID: string;
  copyrightText: "NOASSERTION";
  downloadLocation: "NOASSERTION";
  filesAnalyzed: false;
  licenseConcluded: "NOASSERTION";
  licenseDeclared: "NOASSERTION" | "MIT";
  name: string;
  versionInfo: string;
};

export type DesktopSpdxDocument = {
  SPDXID: "SPDXRef-DOCUMENT";
  creationInfo: {
    comment: string;
    created: string;
    creators: ["Organization: SYMBaiEX", "Tool: Doolittle desktop SBOM"];
  };
  dataLicense: "CC0-1.0";
  documentNamespace: string;
  name: string;
  packages: SpdxPackage[];
  relationships: Array<{
    relatedSpdxElement: string;
    relationshipType: "DESCRIBES" | "DEPENDS_ON";
    spdxElementId: string;
  }>;
  spdxVersion: "SPDX-2.3";
};

const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const ROOT_SPDX_ID = "SPDXRef-Package-Doolittle-Desktop";

export function desktopSbomName(platform: DesktopSbomPlatform): string {
  return `doolittle-desktop-${platform}.spdx.json`;
}

function dependencyId(
  dependency: DesktopArtifactDependency,
  index: number,
): string {
  const safeName = dependency.name
    .replaceAll(/[^A-Za-z0-9.-]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return `SPDXRef-Package-${index + 1}-${safeName || "dependency"}`;
}

function normalizedCreatedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp))
    throw new Error(`Invalid SPDX creation timestamp: ${value}`);
  return new Date(timestamp).toISOString();
}

export function createDesktopSpdxDocument({
  platform,
  commit,
  createdAt,
  desktopVersion,
  appAsarSha256,
  runtimeSha256,
  desktopManifestSha256,
  dependencies,
}: {
  platform: DesktopSbomPlatform;
  commit: string;
  createdAt: string;
  desktopVersion: string;
  appAsarSha256: string;
  runtimeSha256: string;
  desktopManifestSha256: string;
  dependencies: DesktopArtifactDependency[];
}): DesktopSpdxDocument {
  if (!COMMIT_SHA.test(commit))
    throw new Error(`Invalid SPDX source commit: ${commit}`);
  for (const [name, value] of Object.entries({
    appAsarSha256,
    runtimeSha256,
    desktopManifestSha256,
  })) {
    if (!SHA256.test(value)) throw new Error(`Invalid SPDX ${name}: ${value}`);
  }
  if (!desktopVersion) throw new Error("Desktop SPDX root version is missing.");
  if (dependencies.length === 0)
    throw new Error(
      "Desktop artifact inventory is empty; refusing to write SBOM.",
    );
  const dependencyPackages = dependencies.map((dependency, index) => ({
    SPDXID: dependencyId(dependency, index),
    copyrightText: "NOASSERTION" as const,
    downloadLocation: "NOASSERTION" as const,
    filesAnalyzed: false as const,
    licenseConcluded: "NOASSERTION" as const,
    licenseDeclared: "NOASSERTION" as const,
    name: dependency.name,
    versionInfo: dependency.version,
  }));
  const root: SpdxPackage = {
    SPDXID: ROOT_SPDX_ID,
    copyrightText: "NOASSERTION",
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: "MIT",
    name: "Doolittle desktop",
    versionInfo: desktopVersion,
  };
  return {
    SPDXID: "SPDXRef-DOCUMENT",
    creationInfo: {
      comment: [
        `app.asar SHA-256: ${appAsarSha256}`,
        `runtime tree SHA-256: ${runtimeSha256}`,
        `desktop artifact manifest SHA-256: ${desktopManifestSha256}`,
      ].join("; "),
      created: normalizedCreatedAt(createdAt),
      creators: ["Organization: SYMBaiEX", "Tool: Doolittle desktop SBOM"],
    },
    dataLicense: "CC0-1.0",
    documentNamespace: `https://github.com/SYMBaiEX/doolittle/sbom/${commit}/desktop/${platform}`,
    name: `Doolittle desktop ${platform}`,
    packages: [root, ...dependencyPackages],
    relationships: [
      {
        relatedSpdxElement: ROOT_SPDX_ID,
        relationshipType: "DESCRIBES",
        spdxElementId: "SPDXRef-DOCUMENT",
      },
      ...dependencyPackages.map((dependency) => ({
        relatedSpdxElement: dependency.SPDXID,
        relationshipType: "DEPENDS_ON" as const,
        spdxElementId: ROOT_SPDX_ID,
      })),
    ],
    spdxVersion: "SPDX-2.3",
  };
}

export function validateDesktopSpdxDocument(
  value: unknown,
  expected: {
    platform: DesktopSbomPlatform;
    commit: string;
    appAsarSha256: string;
    runtimeSha256: string;
    desktopManifestSha256: string;
  },
): DesktopSpdxDocument {
  if (typeof value !== "object" || value === null)
    throw new Error("Desktop SPDX document is invalid.");
  const document = value as Partial<DesktopSpdxDocument>;
  const comment = [
    `app.asar SHA-256: ${expected.appAsarSha256}`,
    `runtime tree SHA-256: ${expected.runtimeSha256}`,
    `desktop artifact manifest SHA-256: ${expected.desktopManifestSha256}`,
  ].join("; ");
  if (
    !COMMIT_SHA.test(expected.commit) ||
    document.SPDXID !== "SPDXRef-DOCUMENT" ||
    document.spdxVersion !== "SPDX-2.3" ||
    document.dataLicense !== "CC0-1.0" ||
    document.documentNamespace !==
      `https://github.com/SYMBaiEX/doolittle/sbom/${expected.commit}/desktop/${expected.platform}` ||
    document.name !== `Doolittle desktop ${expected.platform}` ||
    document.creationInfo?.comment !== comment ||
    document.creationInfo.creators?.join("|") !==
      "Organization: SYMBaiEX|Tool: Doolittle desktop SBOM" ||
    !Array.isArray(document.packages) ||
    document.packages.length < 2 ||
    document.packages[0]?.SPDXID !== ROOT_SPDX_ID ||
    !Array.isArray(document.relationships) ||
    document.relationships.length !== document.packages.length
  ) {
    throw new Error("Desktop SPDX document is invalid or mismatched.");
  }
  for (const [index, dependency] of document.packages.slice(1).entries()) {
    if (
      dependency.SPDXID !==
        dependencyId(
          { name: dependency.name, version: dependency.versionInfo },
          index,
        ) ||
      document.relationships[index + 1]?.spdxElementId !== ROOT_SPDX_ID ||
      document.relationships[index + 1]?.relationshipType !== "DEPENDS_ON" ||
      document.relationships[index + 1]?.relatedSpdxElement !==
        dependency.SPDXID
    ) {
      throw new Error("Desktop SPDX dependency inventory is invalid.");
    }
  }
  return document as DesktopSpdxDocument;
}

export function writeDesktopSpdxDocument({
  releaseDirectory,
  resourcesDirectory,
  platform,
  commit,
  createdAt,
  appAsarSha256,
  runtimeSha256,
  desktopManifestSha256,
}: {
  releaseDirectory: string;
  resourcesDirectory: string;
  platform: DesktopSbomPlatform;
  commit: string;
  createdAt: string;
  appAsarSha256: string;
  runtimeSha256: string;
  desktopManifestSha256: string;
}): string {
  const manifest = validateDesktopArtifactManifest(
    JSON.parse(
      readFileSync(
        resolve(resourcesDirectory, "desktop-artifact-manifest.json"),
        "utf8",
      ),
    ),
  );
  const document = createDesktopSpdxDocument({
    platform,
    commit,
    createdAt,
    desktopVersion: manifest.desktop.version,
    appAsarSha256,
    runtimeSha256,
    desktopManifestSha256,
    dependencies: manifest.dependencies,
  });
  const path = resolve(releaseDirectory, desktopSbomName(platform));
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return path;
}
