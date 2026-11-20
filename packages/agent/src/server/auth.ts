import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyCors,
  isAllowedHost,
  isTrustedLocalRequest,
  resolveTerminalRunRejection,
  type TerminalRunRejection,
  tokenMatches,
} from "@elizaos/agent/api/server-helpers-auth";

const DOOLITTLE_CORS_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const TERMINAL_MUTATION_PATHS = new Set([
  "/terminal/run",
  "/terminal/run/stream",
  "/terminal/session/start",
  "/terminal/session/input",
  "/terminal/session/resize",
  "/terminal/session/interrupt",
  "/terminal/session/close",
]);

/** Rust-launched dedicated services own this capability outside the runtime environment. */
export function createStrictLoopbackTokenPolicy(token: string) {
  if (!/^[!-~]{32,4096}$/u.test(token)) {
    throw new Error(
      "Strict loopback API service requires a valid bearer capability.",
    );
  }
  const expected = `Bearer ${token}`;
  return (request: IncomingMessage): 401 | 403 | null => {
    const target = request.url ?? "";
    if (
      !isAllowedHost(request) ||
      request.headers.origin !== undefined ||
      !target.startsWith("/") ||
      target.startsWith("//") ||
      target.includes("\\") ||
      target.includes("#")
    )
      return 403;
    const supplied = request.headers.authorization;
    return typeof supplied === "string" && tokenMatches(expected, supplied)
      ? null
      : 401;
  };
}

/**
 * The three public provider callbacks authenticate at their own protocol
 * boundary: Slack and WhatsApp POSTs carry signed payloads, and WhatsApp's
 * subscription probe carries its verification token. Keep this list exact so
 * no other webhook (or ordinary API route) can bypass Doolittle API auth.
 */
export function isProviderAuthenticatedWebhookRequest(
  pathname: string,
  method: string,
): boolean {
  return (
    (method === "POST" &&
      (pathname === "/webhooks/slack" || pathname === "/webhooks/whatsapp")) ||
    (method === "GET" && pathname === "/webhooks/whatsapp")
  );
}

/**
 * Apply Eliza's canonical origin policy and security headers.
 *
 * Doolittle has product-owned PATCH routes, while beta.7's public helper does
 * not advertise PATCH or HEAD in its preflight response. Keep that delta as a
 * narrow transport adapter; origin validation and security policy stay owned
 * by the SDK.
 */
export function applyDoolittleCors(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): boolean {
  const allowed = applyCors(request, response, pathname);
  if (allowed && response.hasHeader("Access-Control-Allow-Origin")) {
    response.setHeader("Access-Control-Allow-Methods", DOOLITTLE_CORS_METHODS);
  }
  return allowed;
}

/**
 * Preserve the trusted loopback desktop while requiring remote Doolittle
 * terminal mutations to cross Eliza's dedicated terminal-token boundary. The
 * canonical `/api/terminal/run` route enforces the SDK's header-or-body token
 * contract inside its bounded route handler.
 */
export function remoteTerminalMutationTokenError(
  request: IncomingMessage,
  pathname: string,
  method = request.method ?? "GET",
): TerminalRunRejection | null {
  if (
    method !== "POST" ||
    !TERMINAL_MUTATION_PATHS.has(pathname) ||
    isTrustedLocalRequest(request)
  ) {
    return null;
  }

  const rejection = resolveTerminalRunRejection(request, {});
  if (
    rejection?.status === 401 &&
    rejection.reason.startsWith("Missing terminal token.")
  ) {
    return {
      status: 401,
      reason:
        "Missing terminal token. Provide X-Eliza-Terminal-Token for remote terminal mutations.",
    };
  }
  return rejection;
}

/** Adapt a Web Request route to Eliza's canonical Node terminal policy. */
export function sdkTerminalRunTokenError(
  request: Request,
  body: Record<string, unknown> = {},
): TerminalRunRejection | null {
  const headers: IncomingMessage["headers"] = {};
  request.headers.forEach((value, name) => {
    headers[name] = value;
  });
  return resolveTerminalRunRejection({ headers } as IncomingMessage, {
    terminalToken:
      typeof body.terminalToken === "string" ? body.terminalToken : undefined,
  });
}
