export const DEFAULT_DOOLITTLE_API_URL = "http://127.0.0.1:3000";

export interface HealthProbeResult {
  ok: boolean;
  status: number;
  endpoint: string;
  body: string;
}

export function resolveDoolittleApiUrl(
  configuredUrl: string | undefined,
  configuredPort: string | undefined,
): string {
  const baseUrl =
    configuredUrl?.trim() ||
    (configuredPort?.trim()
      ? `http://127.0.0.1:${configuredPort.trim()}`
      : DEFAULT_DOOLITTLE_API_URL);
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Doolittle API URL must use http or https.");
  }
  const authorityStart = baseUrl.indexOf("://") + 3;
  const authorityEnd = baseUrl.indexOf("/", authorityStart);
  const authority = baseUrl.slice(
    authorityStart,
    authorityEnd === -1 ? baseUrl.length : authorityEnd,
  );
  if (authority.includes("@")) {
    throw new Error("Doolittle API URL must not contain credentials.");
  }
  return `${parsed.protocol}//${parsed.host}/health`;
}

/** Scope an environment token to one operator-trusted origin, never redirects. */
export function createHealthProbeRequest(
  endpoint: string,
  token: string | undefined,
  configuredPort: string | undefined,
  configuredAuthOrigin: string | undefined,
): RequestInit {
  const headers: Record<string, string> = {};
  const request: RequestInit = { headers, redirect: "error" };
  const trimmedToken = token?.trim();
  const authOrigin = configuredAuthOrigin?.trim();
  if (!trimmedToken && !authOrigin) return request;
  const trusted = new URL(
    authOrigin || resolveDoolittleApiUrl(undefined, configuredPort),
  );
  if (trusted.username || trusted.password || authOrigin?.includes("@")) {
    throw new Error(
      "Probe authentication origin must not contain credentials.",
    );
  }
  if (
    authOrigin &&
    (trusted.pathname !== "/" || trusted.search || trusted.hash)
  ) {
    throw new Error("Probe authentication origin must contain only an origin.");
  }
  const numericLoopback =
    trusted.hostname === "127.0.0.1" || trusted.hostname === "[::1]";
  if (
    trusted.protocol !== "https:" &&
    !(trusted.protocol === "http:" && numericLoopback)
  ) {
    throw new Error("Remote probe authentication requires an HTTPS origin.");
  }
  if (trimmedToken && new URL(endpoint).origin === trusted.origin) {
    headers.authorization = `Bearer ${trimmedToken}`;
  }
  return request;
}

export function normalizeHealthBody(body: string): string {
  return body.trim().slice(0, 2_000);
}

export function createHealthProbeResult(
  endpoint: string,
  status: number,
  body: string,
): HealthProbeResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    endpoint,
    body: normalizeHealthBody(body),
  };
}
