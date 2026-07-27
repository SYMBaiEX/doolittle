import { workspaceRelativePath } from "./path";

export type WorkspacePathDisposition = "visible" | "noise" | "sensitive";

export interface WorkspacePathPolicyDecision {
  disposition: WorkspacePathDisposition;
  path: string;
  reason?: string;
}

/*
 * This is the single exposure policy for operator-facing workspace surfaces.
 *
 * Keep these rules deliberately narrow:
 * - generated/runtime directories and disposable logs are omitted as noise;
 * - files that commonly hold local credentials are omitted and cannot be read
 *   or written through WorkspaceService;
 * - source-control metadata such as .github remains visible;
 * - explicitly named example/sample/template files remain visible so setup
 *   instructions and configuration contracts are still useful.
 */
const noiseDirectoryNames = new Set([
  ".cache",
  ".doolittle",
  ".eliza",
  ".git",
  ".idea",
  ".next",
  ".output",
  ".parcel-cache",
  ".playwright-cli",
  ".svelte-kit",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "output",
  "release",
]);

const noiseFileNames = new Set([".ds_store", "desktop.ini", "thumbs.db"]);

const sensitiveDirectoryNames = new Set([
  ".aws",
  ".azure",
  ".gnupg",
  ".kube",
  ".ssh",
]);

const sensitiveFileNames = new Set([
  ".dev.vars",
  ".envrc",
  ".git-credentials",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "_netrc",
  "application_default_credentials.json",
  "config.local.json",
  "settings.local.json",
  "terraform.tfstate",
  "terraform.tfstate.backup",
]);

const privateKeyFileNames = new Set([
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
]);

const privateMaterialExtensions = [
  ".jks",
  ".kdbx",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
];

const structuredConfigExtensions = new Set([
  "conf",
  "config",
  "ini",
  "json",
  "jsonc",
  "toml",
  "yaml",
  "yml",
]);

const safeTemplateMarkerPattern =
  /(?:^|[._-])(?:example|sample|template)(?:[._-]|$)/iu;
const sensitiveConfigStemPattern =
  /(?:^|[._-])(?:api[._-]?keys?|client[._-]?secrets?|credentials?|secrets?|tokens?)(?:[._-]|$)/iu;

export function normalizeWorkspacePolicyPath(path: string): string {
  const normalized = workspaceRelativePath(path.trim()).replace(/\/+/gu, "/");
  const segments: string[] = [];

  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length && segments.at(-1) !== "..") {
        segments.pop();
      } else {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }

  return segments.join("/");
}

export function classifyWorkspacePath(
  path: string,
): WorkspacePathPolicyDecision {
  const normalizedPath = normalizeWorkspacePolicyPath(path);
  const segments = normalizedPath.split("/").filter(Boolean);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const lowerFileName = lowerSegments.at(-1) ?? "";

  if (
    lowerSegments.some((segment) => sensitiveDirectoryNames.has(segment)) ||
    isSensitiveFileName(lowerFileName)
  ) {
    return {
      disposition: "sensitive",
      path: normalizedPath,
      reason: "credential-bearing local configuration",
    };
  }

  if (
    lowerSegments.some((segment) => noiseDirectoryNames.has(segment)) ||
    noiseFileNames.has(lowerFileName) ||
    lowerFileName.endsWith(".log") ||
    lowerFileName.endsWith("-tscheck.json")
  ) {
    return {
      disposition: "noise",
      path: normalizedPath,
      reason: "generated or runtime-only content",
    };
  }

  return {
    disposition: "visible",
    path: normalizedPath,
  };
}

export function isWorkspacePathVisible(path: string): boolean {
  return classifyWorkspacePath(path).disposition === "visible";
}

export function assertWorkspacePathIsSafe(
  path: string,
  operation: "read" | "write",
): void {
  const decision = classifyWorkspacePath(path);
  if (decision.disposition !== "sensitive") {
    return;
  }

  const operationLabel = operation === "read" ? "read" : "written";
  throw new Error(
    `Workspace path is protected and cannot be ${operationLabel}: ${decision.path}`,
  );
}

function isSensitiveFileName(fileName: string): boolean {
  if (!fileName) {
    return false;
  }

  if (fileName === ".env" || fileName.startsWith(".env.")) {
    return !isSafeEnvironmentTemplateName(fileName);
  }

  if (
    sensitiveFileNames.has(fileName) ||
    privateKeyFileNames.has(fileName) ||
    privateMaterialExtensions.some((extension) => fileName.endsWith(extension))
  ) {
    return true;
  }

  if (fileName.endsWith(".tfvars") || fileName.includes(".tfvars.")) {
    return !safeTemplateMarkerPattern.test(fileName);
  }

  const extension = fileName.split(".").at(-1) ?? "";
  return (
    structuredConfigExtensions.has(extension) &&
    sensitiveConfigStemPattern.test(fileName) &&
    !safeTemplateMarkerPattern.test(fileName)
  );
}

function isSafeEnvironmentTemplateName(fileName: string): boolean {
  return /^\.env(?:\.[^./]+)*\.(?:example|sample|template)$/iu.test(fileName);
}
