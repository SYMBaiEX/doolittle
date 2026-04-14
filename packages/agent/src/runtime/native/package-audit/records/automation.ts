import type { NativePackageAuditRecord } from "../types";

export const NATIVE_AUTOMATION_PACKAGE_AUDIT_RECORDS: NativePackageAuditRecord[] =
  [
    {
      packageName: "@elizaos/plugin-cron",
      role: "automation",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "2.0.0-alpha.3",
      alphaTagVersion: "2.0.0-alpha.7",
      compatibility: "alpha-only",
      note: "Official cron plugin is now owned directly on the alpha line.",
    },
    {
      packageName: "@elizaos/plugin-agent-skills",
      role: "automation",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "1.0.0",
      alphaTagVersion: "2.0.0-alpha.70",
      compatibility: "alpha-only",
      note: "Official agent-skills package is now owned directly on the alpha line.",
    },
    {
      packageName: "@elizaos/plugin-trajectory-logger",
      role: "automation",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "2.0.0-alpha.1",
      alphaTagVersion: "2.0.0-alpha.20",
      compatibility: "alpha-only",
      note: "Official trajectory logger package is now owned directly on the alpha line.",
    },
    {
      packageName: "@elizaos/plugin-action-bench",
      role: "research",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "1.4.4",
      compatibility: "vendored-by-design",
      note: "Workspace-native action-bench plugin replaces the lagging published line so benchmark coverage stays native to the current runtime stack.",
    },
    {
      packageName: "@elizaos/plugin-autocoder",
      role: "research",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "1.3.3",
      compatibility: "vendored-by-design",
      note: "Workspace-native autocoder plugin replaces the older published line so code generation, GitHub, and secrets services boot cleanly on the current runtime stack.",
    },
  ];
