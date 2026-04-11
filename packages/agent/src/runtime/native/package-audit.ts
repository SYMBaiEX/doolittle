import type { EnvConfig } from "@/types/runtime";
import { getNativePackageAuditRecords } from "./package-audit/records";
import { getLatestRuntimeLine } from "./package-audit/runtime-line";
import { summarizeNativePackageAuditPackages } from "./package-audit/summary";
import type {
  NativePackageAuditRecord,
  NativePackageAuditSummary,
} from "./package-audit/types";
import { getNativePluginCatalog } from "./plugin-catalog/index";

export type { NativePackageAuditRecord, NativePackageAuditSummary };
export { getLatestRuntimeLine };

export function getNativePackageAudit(config: EnvConfig): {
  runtime: ReturnType<typeof getLatestRuntimeLine>;
  packages: NativePackageAuditRecord[];
  summary: NativePackageAuditSummary;
  activeCatalog: ReturnType<typeof getNativePluginCatalog>;
} {
  const packages = getNativePackageAuditRecords();

  return {
    runtime: getLatestRuntimeLine(),
    packages,
    summary: summarizeNativePackageAuditPackages(packages),
    activeCatalog: getNativePluginCatalog(config),
  };
}
