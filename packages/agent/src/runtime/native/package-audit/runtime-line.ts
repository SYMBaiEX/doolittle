import type { NativePackageAuditRuntimeLine } from "./types";

export function getLatestRuntimeLine(): NativePackageAuditRuntimeLine {
  return {
    date: "2026-11-20",
    latest: "2.0.5",
    beta: "2.0.3-beta.7",
  };
}
