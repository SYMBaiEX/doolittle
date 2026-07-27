const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function trustedDevRendererUrl(
  configuredUrl: string | undefined,
  isPackaged: boolean,
): string | undefined {
  if (isPackaged || !configuredUrl?.trim()) return undefined;
  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "http:" || !LOOPBACK_HOSTS.has(parsed.hostname)) {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function isTrustedRendererNavigation(
  candidateUrl: string,
  rendererOrigin: string | undefined,
): boolean {
  if (!rendererOrigin) return false;
  try {
    return new URL(candidateUrl).origin === rendererOrigin;
  } catch {
    return false;
  }
}
