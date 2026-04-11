import type { TerminalRunResult } from "../execution/subprocess";

export function createMissingCloudTargetRunResult(
  backendLabel: string,
  targetKey: string,
): TerminalRunResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: `${backendLabel} backend requires ${targetKey}.`,
    timedOut: false,
    durationMs: 0,
  };
}

export function readCloudInfoSummary(
  stdout: string,
  fallback = "available",
): string {
  if (!stdout) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    return typeof parsed.name === "string"
      ? parsed.name
      : typeof parsed.id === "string"
        ? parsed.id
        : typeof parsed.status === "string"
          ? parsed.status
          : fallback;
  } catch {
    return fallback;
  }
}
