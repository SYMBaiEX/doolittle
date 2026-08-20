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
