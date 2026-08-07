export interface ElizaWorkspaceCompatibilityPackage {
  packageName: `@elizaos/${string}`;
  packagePath: string;
  kind: "resolver-shim";
  allowedVersion: string;
  upstreamVersion: string;
  requiredExports: string[];
  consumers: string[];
  reason: string;
}

/**
 * Deliberate local packages that occupy an upstream ElizaOS package name.
 *
 * These entries are runtime compatibility boundaries, not ordinary Doolittle
 * workspaces. Keeping the ownership and required exports executable prevents
 * an SDK-alignment check from hiding a patch or a cleanup from deleting a
 * resolver shim that the packaged desktop runtime still needs.
 */
export const ELIZA_WORKSPACE_COMPATIBILITY: readonly ElizaWorkspaceCompatibilityPackage[] =
  [
    {
      packageName: "@elizaos/app-training",
      packagePath: "packages/app-training/package.json",
      kind: "resolver-shim",
      allowedVersion: "2.0.3-beta.7",
      upstreamVersion: "2.0.3-beta.7",
      requiredExports: ["."],
      consumers: ["root dependency resolution"],
      reason:
        "Keeps the beta workspace package resolvable without vendoring unpublished source.",
    },
    {
      packageName: "@elizaos/cloud-shared",
      packagePath: "packages/cloud-shared/package.json",
      kind: "resolver-shim",
      allowedVersion: "2.0.3-beta.7",
      upstreamVersion: "2.0.3-beta.7",
      requiredExports: ["."],
      consumers: ["root dependency resolution"],
      reason:
        "Provides the beta cloud shared module boundary used by linked workspaces.",
    },
    {
      packageName: "@elizaos/plugin-remote-manifest",
      packagePath: "packages/plugin-remote-manifest/package.json",
      kind: "resolver-shim",
      allowedVersion: "2.0.3-beta.7",
      upstreamVersion: "2.0.3-beta.7",
      requiredExports: ["."],
      consumers: ["Eliza plugin loading compatibility"],
      reason:
        "Supplies the remote-manifest contract missing from the published beta runtime.",
    },
    {
      packageName: "@elizaos/plugin-worker-runtime",
      packagePath: "packages/plugin-worker-runtime/package.json",
      kind: "resolver-shim",
      allowedVersion: "2.0.3-beta.7",
      upstreamVersion: "2.0.3-beta.7",
      requiredExports: [".", "./error"],
      consumers: ["Eliza plugin worker compatibility"],
      reason:
        "Preserves the beta worker error wire contract and module resolution surface.",
    },
    {
      packageName: "@elizaos/registry",
      packagePath: "packages/registry/package.json",
      kind: "resolver-shim",
      allowedVersion: "2.0.3-beta.7",
      upstreamVersion: "2.0.3-beta.7",
      requiredExports: [
        ".",
        "./first-party/channel-plugin-map.json",
        "./first-party/curated-app-definitions.json",
      ],
      consumers: ["apps/desktop/scripts/prepare-runtime.ts"],
      reason:
        "Makes the curated registry JSON subpaths available to desktop packaging.",
    },
  ];
