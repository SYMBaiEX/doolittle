import applicationPackage from "../../../../../package.json" with {
  type: "json",
};
import runtimePackage from "../../../package.json" with { type: "json" };

import { getNativePackageAudit } from "../../runtime/native/package-audit/index";
import { getNativePluginCatalog } from "../../runtime/native/plugin-catalog/index";
import type { EnvConfig } from "../../types/index";

interface PackageMetadata {
  name: string;
  version: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface OperatorVersionSummary {
  name: string;
  version: string;
  description?: string;
  node: string;
  nub: string;
  dependencies: Record<string, string>;
  nativePlugins: {
    total: number;
    enabled: number;
    official: number;
    vendored: number;
  };
  nativePackages: {
    runtimeLatest: string;
    runtimeBeta: string;
    aligned: number;
    vendored: number;
    betaOnly: number;
    workspaceOnly: number;
  };
}

export function loadOperatorPackageMetadata(): PackageMetadata {
  return { ...applicationPackage, dependencies: runtimePackage.dependencies };
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
    node: process.versions.node,
    nub: packageMetadata.devDependencies?.["@nubjs/nub"] ?? "unknown",
    dependencies: {
      "@elizaos/core":
        packageMetadata.dependencies?.["@elizaos/core"] ?? "unknown",
      "@elizaos/agent":
        packageMetadata.dependencies?.["@elizaos/agent"] ?? "unknown",
      "@elizaos/plugin-openai":
        packageMetadata.dependencies?.["@elizaos/plugin-openai"] ?? "unknown",
      "@elizaos/plugin-anthropic":
        packageMetadata.dependencies?.["@elizaos/plugin-anthropic"] ??
        "unknown",
      "@doolittle/plugin-local-sandbox": "consolidated",
      "@doolittle/plugin-forms": "consolidated",
      "@doolittle/plugin-planning": "consolidated",
      "@doolittle/plugin-autocoder":
        packageMetadata.dependencies?.["@doolittle/plugin-autocoder"] ??
        "consolidated",
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
      runtimeBeta: nativePackages.runtime.beta,
      aligned: nativePackages.summary.aligned,
      vendored: nativePackages.summary.vendored,
      betaOnly: nativePackages.summary.betaOnly,
      workspaceOnly: nativePackages.summary.workspaceOnly,
    },
  };
}
