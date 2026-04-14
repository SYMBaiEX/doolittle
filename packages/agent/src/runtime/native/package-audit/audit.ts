import type { EnvConfig } from "@/types/runtime";
import { getNativePluginCatalog } from "../plugin-catalog";
import { getNativePackageAuditRecords } from "./records";
import { getLatestRuntimeLine } from "./runtime-line";
import { summarizeNativePackageAuditPackages } from "./summary";
import type {
  NativePackageAuditRecord,
  NativePackageAuditRuntimeLine,
  NativePackageAuditSummary,
} from "./types";

export interface NativePackageAuditSnapshot {
  runtime: NativePackageAuditRuntimeLine;
  packages: NativePackageAuditRecord[];
  summary: NativePackageAuditSummary;
  activeCatalog: ReturnType<typeof getNativePluginCatalog>;
}

export function buildNativePackageAudit(
  config: EnvConfig,
): NativePackageAuditSnapshot {
  const packages = getNativePackageAuditRecords();

  return {
    runtime: getLatestRuntimeLine(),
    packages,
    summary: summarizeNativePackageAuditPackages(packages),
    activeCatalog: getNativePluginCatalog(config),
  };
}
