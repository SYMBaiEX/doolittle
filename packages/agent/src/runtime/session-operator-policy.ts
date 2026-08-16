import type { ChatTurnRequest } from "@/types/runtime";

const TRUSTED_OPERATOR_SOURCES = new Set([
  "api",
  "automation",
  "cli",
  "cron",
  "desktop",
]);

export const GLOBAL_SESSION_ACCESS_DENIED =
  "Global session history is available only to a local or authenticated API operator.";

/**
 * These sources are created only after a local entry point or the authenticated
 * HTTP ingress has accepted the request. Gateway adapters set their concrete
 * platform name, so pairing grants conversation access without granting the
 * machine-wide operator session surface.
 *
 * `source` is presentation metadata on the authenticated API, not an auth
 * credential: an unauthenticated caller never reaches the chat route, and a
 * gateway sender cannot choose a different platform source.
 */
export function hasGlobalSessionOperatorAccess(
  source: ChatTurnRequest["source"],
): boolean {
  return typeof source === "string" && TRUSTED_OPERATOR_SOURCES.has(source);
}

function targetAfter(trimmed: string, prefix: string): string | undefined {
  if (!trimmed.startsWith(prefix)) return undefined;
  return trimmed.slice(prefix.length).trim();
}

/** True when a command reads or mutates a session other than the active one. */
export function requiresGlobalSessionOperatorAccess(
  trimmed: string,
  sessionKey: string,
): boolean {
  if (
    trimmed.startsWith("/search ") ||
    trimmed === "/sessions" ||
    trimmed === "/sessions list" ||
    trimmed === "/resume" ||
    trimmed.startsWith("/resume ")
  ) {
    return true;
  }

  const titleTarget = targetAfter(trimmed, "/session title ")
    ?.split("::", 1)[0]
    ?.trim();
  if (titleTarget) return titleTarget !== sessionKey;

  for (const prefix of [
    "/session continuity ",
    "/session summary ",
    "/usage ",
  ]) {
    const target = targetAfter(trimmed, prefix);
    if (target) return target !== sessionKey;
  }

  return false;
}
