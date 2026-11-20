import type { NativePackageAuditRecord } from "../types";

export const NATIVE_FOUNDATION_PACKAGE_AUDIT_RECORDS: NativePackageAuditRecord[] =
  [
    {
      packageName: "@elizaos/core",
      role: "runtime-core",
      currentStrategy: "official",
      currentTag: "workspace",
      latestTagVersion: "2.0.5",
      betaTagVersion: "2.0.3-beta.7",
      compatibility: "aligned",
      note: "Core runtime is built from the verified ElizaOS release source.",
    },
    {
      packageName: "@elizaos/agent",
      role: "foundation",
      currentStrategy: "official",
      currentTag: "workspace",
      latestTagVersion: "2.0.5",
      betaTagVersion: "2.0.3-beta.7",
      compatibility: "aligned",
      note: "Agent registry and runtime shape come from the verified ElizaOS release source.",
    },
    {
      packageName: "@elizaos/shared",
      role: "foundation",
      currentStrategy: "official",
      currentTag: "beta",
      latestTagVersion: "2.0.0-alpha.144",
      betaTagVersion: "2.0.3-beta.7",
      compatibility: "beta-only",
      note: "Shared contracts and cloud helpers use the compatible published SDK package.",
    },
    {
      packageName: "@elizaos/skills",
      role: "foundation",
      currentStrategy: "official",
      currentTag: "beta",
      latestTagVersion: "2.0.0-alpha.77",
      betaTagVersion: "2.0.3-beta.7",
      compatibility: "beta-only",
      note: "The skills catalog uses the compatible published dist entrypoint.",
    },
  ];
