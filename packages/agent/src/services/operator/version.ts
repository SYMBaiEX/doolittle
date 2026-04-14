import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { EnvConfig } from "@/types";

interface PackageMetadata {
  name: string;
  version: string;
  description?: string;
  dependencies?: Record<string, string>;
}

export interface OperatorVersionSummary {
  name: string;
  version: string;
  description?: string;
  bun: string;
  dependencies: Record<string, string>;
  nativePlugins: {
    total: number;
    enabled: number;
    official: number;
    vendored: number;
  };
  nativePackages: {
    runtimeLatest: string;
    runtimeAlpha: string;
    aligned: number;
    vendored: number;
    alphaOnly: number;
    workspaceOnly: number;
  };
}

export function loadOperatorPackageMetadata(): PackageMetadata {
  const packagePath = resolve(
    dirname(new URL(import.meta.url).pathname),
    "../../../../../package.json",
  );
  return JSON.parse(readFileSync(packagePath, "utf8")) as PackageMetadata;
}

export function buildOperatorVersionSummary(
  config: EnvConfig,
  packageMetadata: PackageMetadata,
): OperatorVersionSummary {
  const nativePlugins = getNativePluginCatalog(config);
  const nativePackages = getNativePackageAudit(config);
  return {
    name: packageMetadata.name,
    version: packageMetadata.version,
    description: packageMetadata.description,
    bun: Bun.version,
    dependencies: {
      "@elizaos/core":
        packageMetadata.dependencies?.["@elizaos/core"] ?? "unknown",
      "@elizaos/agent":
        packageMetadata.dependencies?.["@elizaos/agent"] ?? "unknown",
      elizaos: packageMetadata.dependencies?.elizaos ?? "unknown",
      "@elizaos/plugin-openai":
        packageMetadata.dependencies?.["@elizaos/plugin-openai"] ?? "unknown",
      "@elizaos/plugin-anthropic":
        packageMetadata.dependencies?.["@elizaos/plugin-anthropic"] ??
        "unknown",
      "@elizaos/plugin-browser":
        packageMetadata.dependencies?.["@elizaos/plugin-browser"] ?? "unknown",
      "@elizaos/plugin-tts":
        packageMetadata.dependencies?.["@elizaos/plugin-tts"] ?? "unknown",
      "@elizaos/plugin-e2b":
        packageMetadata.dependencies?.["@elizaos/plugin-e2b"] ?? "unknown",
      "@elizaos/plugin-forms":
        packageMetadata.dependencies?.["@elizaos/plugin-forms"] ?? "unknown",
      "@elizaos/plugin-mcp":
        packageMetadata.dependencies?.["@elizaos/plugin-mcp"] ?? "unknown",
      "@elizaos/plugin-action-bench":
        packageMetadata.dependencies?.["@elizaos/plugin-action-bench"] ??
        "unknown",
      "@elizaos/plugin-autocoder":
        packageMetadata.dependencies?.["@elizaos/plugin-autocoder"] ??
        "unknown",
    },
    nativePlugins: {
      total: nativePlugins.length,
      enabled: nativePlugins.filter((entry) => entry.enabled).length,
      official: nativePlugins.filter((entry) => entry.source === "official")
        .length,
      vendored: nativePlugins.filter((entry) => entry.source === "vendored")
        .length,
    },
    nativePackages: {
      runtimeLatest: nativePackages.runtime.latest,
      runtimeAlpha: nativePackages.runtime.alpha,
      aligned: nativePackages.summary.aligned,
      vendored: nativePackages.summary.vendored,
      alphaOnly: nativePackages.summary.alphaOnly,
      workspaceOnly: nativePackages.summary.workspaceOnly,
    },
  };
}
