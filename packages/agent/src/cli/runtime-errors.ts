import { getCliErrorMessage } from "@/cli/execution";
import type { AppLogger } from "@/logging/logger";

export function isRecoverableProviderError(error: unknown): boolean {
  const normalized = getCliErrorMessage(error).toLowerCase();
  return (
    normalized.includes("cannot connect to api") ||
    normalized.includes("unable to connect") ||
    normalized.includes("failedtoopensocket") ||
    normalized.includes("connectionrefused") ||
    normalized.includes("no output generated") ||
    normalized.includes("unauthorized") ||
    normalized.includes("rate limit") ||
    normalized.includes("429") ||
    normalized.includes("database is shutting down") ||
    normalized.includes("operation rejected") ||
    normalized.includes("failed query: create schema")
  );
}

export function isBenignCliShutdownError(error: unknown): boolean {
  const normalized = getCliErrorMessage(error).toLowerCase();
  return (
    normalized.includes("database is shutting down") ||
    normalized.includes("operation rejected") ||
    normalized.includes("err_use_after_close") ||
    normalized.includes("readline was closed")
  );
}

export function formatRecoverableProviderError(error: unknown): string {
  const detail = getCliErrorMessage(error);
  return detail.length > 280 ? `${detail.slice(0, 277)}...` : detail;
}

export function appendCliTrace(
  logger: AppLogger,
  label: string,
  detail?: string,
): void {
  logger.trace(label, detail);
}
