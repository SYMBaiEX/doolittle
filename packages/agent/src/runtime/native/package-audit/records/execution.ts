import type { NativePackageAuditRecord } from "../types";

export const NATIVE_EXECUTION_PACKAGE_AUDIT_RECORDS: NativePackageAuditRecord[] =
  [
    {
      packageName: "@doolittle/plugin-local-sandbox",
      role: "execution",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "consolidated",
      compatibility: "vendored-by-design",
      note: "Doolittle local sandbox provides E2B-compatible methods without carrying a misleading standalone sandbox workspace package.",
    },
    {
      packageName: "@doolittle/plugin-forms",
      role: "execution",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "consolidated",
      compatibility: "vendored-by-design",
      note: "Doolittle forms adapter is consolidated into doolittle-plugin and backed by local storage contracts.",
    },
    {
      packageName: "@doolittle/plugin-coding-agent",
      role: "execution",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "consolidated",
      compatibility: "vendored-by-design",
      note: "Doolittle coding agent consolidated into doolittle-plugin.",
    },
    {
      packageName: "@doolittle/plugin-agent-orchestrator",
      role: "execution",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "consolidated",
      compatibility: "vendored-by-design",
      note: "Doolittle delegation orchestrator consolidated into doolittle-plugin.",
    },
    {
      packageName: "@doolittle/plugin-planning",
      role: "execution",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "consolidated",
      compatibility: "vendored-by-design",
      note: "Doolittle planning adapter is consolidated into doolittle-plugin and links local delegation and workflow graphs.",
    },
  ];
