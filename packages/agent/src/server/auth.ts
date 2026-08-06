import { timingSafeEqual } from "node:crypto";

/**
 * HTTP API authorization for Doolittle.
 *
 * Doolittle is terminal-first and local-first. The API is meant for the local
 * operator, so the security model is:
 *
 *  - When bound to a loopback host (the default), the OS already restricts the
 *    socket to this machine, so requests are trusted with no token.
 *  - When bound to a non-loopback host (an operator explicitly exposing the API
 *    on a LAN/public interface), a bearer token (`DOOLITTLE_API_TOKEN`) is
 *    REQUIRED — without it every request is rejected, so a public bind is never
 *    silently unauthenticated.
 */

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("127.")
  );
}

export interface ApiAuthConfig {
  host: string;
  apiToken?: string;
}

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function tokenMatches(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.byteLength === providedBytes.byteLength &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

export interface TerminalRunTokenError {
  status: 401;
  reason: string;
}

export function sdkTerminalRunTokenError(
  request: Request,
  body: Record<string, unknown> = {},
  expectedToken = process.env.ELIZA_TERMINAL_RUN_TOKEN,
): TerminalRunTokenError | null {
  const expected = expectedToken?.trim();
  if (!expected) return null;

  const headerToken =
    request.headers.get("x-eliza-terminal-token")?.trim() ?? "";
  const bodyToken =
    typeof body.terminalToken === "string" ? body.terminalToken.trim() : "";
  const provided = headerToken || bodyToken;
  if (!provided) {
    return {
      status: 401,
      reason:
        "Missing terminal token. Provide X-Eliza-Terminal-Token header or terminalToken in request body.",
    };
  }
  if (!tokenMatches(expected, provided)) {
    return { status: 401, reason: "Invalid terminal token." };
  }
  return null;
}

/**
 * The official Eliza SHELL action calls the local SDK terminal endpoint with a
 * dedicated terminal token rather than Doolittle's operator API bearer token.
 * Accept that credential only for the exact SDK terminal route. The route
 * still validates the token again after parsing the body.
 */
export function isSdkTerminalRequestAuthorized(
  request: Request,
  expectedToken = process.env.ELIZA_TERMINAL_RUN_TOKEN,
): boolean {
  const expected = expectedToken?.trim();
  if (!expected || new URL(request.url).pathname !== "/api/terminal/run") {
    return false;
  }
  return sdkTerminalRunTokenError(request, {}, expected) === null;
}

/**
 * True when the request is allowed to reach the API. Loopback binds are
 * trusted; every other bind requires a matching bearer token.
 */
export function isApiRequestAuthorized(
  config: ApiAuthConfig,
  request: Request,
): boolean {
  if (isLoopbackHost(config.host)) {
    return true;
  }
  const token = config.apiToken?.trim();
  if (!token) {
    // Non-loopback bind with no token configured — fail safe (deny all).
    return false;
  }
  const provided = extractBearerToken(request);
  return provided ? tokenMatches(token, provided) : false;
}
