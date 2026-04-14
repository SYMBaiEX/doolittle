import type { ScanSeverity } from "./types";

export const SEVERITY_ORDER: Record<ScanSeverity, number> = {
  info: 0,
  warn: 1,
  block: 2,
};

export function maxSeverity(
  current: ScanSeverity | undefined,
  next: ScanSeverity,
): ScanSeverity {
  if (current === undefined) {
    return next;
  }
  return SEVERITY_ORDER[current] >= SEVERITY_ORDER[next] ? current : next;
}

export function meetsSeverityThreshold(
  severity: ScanSeverity | undefined,
  threshold: ScanSeverity,
): boolean {
  return (
    severity !== undefined &&
    SEVERITY_ORDER[severity] >= SEVERITY_ORDER[threshold]
  );
}
