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
  return extractBearerToken(request) === token;
}
