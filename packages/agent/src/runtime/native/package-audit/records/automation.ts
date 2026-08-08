import type { NativePackageAuditRecord } from "../types";

export const NATIVE_AUTOMATION_PACKAGE_AUDIT_RECORDS: NativePackageAuditRecord[] =
  [
    {
      packageName: "@doolittle/plugin-autocoder",
      role: "research",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "1.3.3",
      compatibility: "vendored-by-design",
      note: "Doolittle-owned Eliza autocoder plugin replaces the older published line so planning, GitHub, and secrets services boot cleanly on the current runtime stack.",
    },
  ];
