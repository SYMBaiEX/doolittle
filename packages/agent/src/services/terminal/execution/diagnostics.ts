import type {
  DiagnosticCheck,
  ExecutionBackendLimits,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";

export function createCheck(
  id: string,
  status: DiagnosticCheck["status"],
  summary: string,
  detail: string,
): DiagnosticCheck {
  return { id, status, summary, detail };
}

export function renderChecks(checks: DiagnosticCheck[]): string[] {
  return checks.map(
    (check) => `[${check.status}] ${check.summary}: ${check.detail}`,
  );
}

export function buildHealthLimits(
  settings: RuntimeSettings,
): ExecutionBackendLimits {
  const execution = settings.execution;
  return {
    commandTimeoutMs: execution.commandTimeoutMs ?? 30_000,
    healthTimeoutMs: execution.healthTimeoutMs ?? 5_000,
    containerCpuLimit: execution.containerCpuLimit ?? "2",
    containerMemoryLimit: execution.containerMemoryLimit ?? "2g",
    containerPidsLimit: execution.containerPidsLimit ?? 256,
    containerReadOnlyRoot: execution.containerReadOnlyRoot ?? true,
  };
}

export function buildBootstrapHints(
  checks: DiagnosticCheck[],
  fallback: string[],
): string[] {
  const hints = checks
    .filter((check) => check.status !== "pass")
    .slice(0, 4)
    .map((check) => `${check.summary}: ${check.detail}`);
  return hints.length > 0 ? hints : fallback;
}
