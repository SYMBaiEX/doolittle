import type {
  NativePackageAuditRecord,
  NativePackageAuditSummary,
} from "./types";

export function summarizeNativePackageAuditPackages(
  packages: NativePackageAuditRecord[],
): NativePackageAuditSummary {
  return {
    aligned: packages.filter((entry) => entry.compatibility === "aligned")
      .length,
    vendored: packages.filter(
      (entry) => entry.compatibility === "vendored-by-design",
    ).length,
    alphaOnly: packages.filter((entry) => entry.compatibility === "alpha-only")
      .length,
    laggingLatest: packages.filter(
      (entry) => entry.compatibility === "lagging-latest",
    ).length,
    workspaceOnly: packages.filter(
      (entry) => entry.compatibility === "workspace-only",
    ).length,
  };
}
