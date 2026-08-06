import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyCors,
  resolveTerminalRunRejection,
  type TerminalRunRejection,
} from "@elizaos/agent/api/server-helpers-auth";

const DOOLITTLE_CORS_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";

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

/** Accept the dedicated SDK terminal credential only on its canonical route. */
export function isSdkTerminalRequestAuthorized(
  request: IncomingMessage,
  pathname: string,
): boolean {
  return (
    pathname === "/api/terminal/run" &&
    Boolean(process.env.ELIZA_TERMINAL_RUN_TOKEN?.trim()) &&
    resolveTerminalRunRejection(request, {}) === null
  );
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
