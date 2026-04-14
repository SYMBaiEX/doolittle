import type { EnvConfig } from "@/types/runtime";
import {
  buildNativePackageAudit,
  type NativePackageAuditSnapshot,
} from "./audit";
import { getLatestRuntimeLine } from "./runtime-line";
import type {
  NativePackageAuditRecord,
  NativePackageAuditRuntimeLine,
  NativePackageAuditSummary,
} from "./types";

export type {
  NativePackageAuditRecord,
  NativePackageAuditRuntimeLine,
  NativePackageAuditSnapshot,
  NativePackageAuditSummary,
};
export { getLatestRuntimeLine };

export function getNativePackageAudit(
  config: EnvConfig,
): NativePackageAuditSnapshot {
  return buildNativePackageAudit(config);
}
