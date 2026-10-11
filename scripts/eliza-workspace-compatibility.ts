export interface ElizaWorkspaceCompatibilityPackage {
  packageName: `@elizaos/${string}`;
  packagePath: string;
  kind: "compatibility-contract";
  allowedVersion: string;
  upstreamVersion: string;
  requiredExports: string[];
  consumers: string[];
  reason: string;
}

export function normalizeCompatibilityPackagePath(path: string): string {
  return path.replaceAll("\\", "/");
}

/**
 * Deliberate local packages that occupy an upstream ElizaOS package name.
 *
 * These entries are SDK compatibility boundaries, not ordinary Doolittle
 * workspaces. Keeping the ownership and required exports executable prevents
 * an SDK-alignment check from hiding a patch or a cleanup from deleting a
 * compatibility contract that the packaged desktop runtime still needs.
 */
export const ELIZA_WORKSPACE_COMPATIBILITY: readonly ElizaWorkspaceCompatibilityPackage[] =
  [
    {
      packageName: "@elizaos/plugin-remote-manifest",
      packagePath: "packages/plugin-remote-manifest/package.json",
      kind: "compatibility-contract",
      allowedVersion: "2.0.3-beta.7",
      upstreamVersion: "2.0.3-beta.7",
      requiredExports: ["."],
      consumers: ["Eliza remote plugin bridge types"],
      reason:
        "Supplies the remote-manifest message type without a false runtime export.",
    },
    {
      packageName: "@elizaos/plugin-worker-runtime",
      packagePath: "packages/plugin-worker-runtime/package.json",
      kind: "compatibility-contract",
      allowedVersion: "2.0.3-beta.7",
      upstreamVersion: "2.0.3-beta.7",
      requiredExports: ["./error"],
      consumers: ["Eliza plugin worker compatibility"],
      reason:
        "Preserves the beta worker error wire contract and module resolution surface.",
    },
    {
      packageName: "@elizaos/registry",
      packagePath: "packages/registry/package.json",
      kind: "compatibility-contract",
      allowedVersion: "2.0.3-beta.7",
      upstreamVersion: "2.0.3-beta.7",
      requiredExports: [
        "./first-party/channel-plugin-map.json",
        "./first-party/curated-app-definitions.json",
      ],
      consumers: ["apps/desktop/scripts/prepare-runtime.ts"],
      reason:
        "Makes the curated registry JSON subpaths available to desktop packaging.",
    },
  ];
