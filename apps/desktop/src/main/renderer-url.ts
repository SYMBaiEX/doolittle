import { isLoopbackBindHost } from "@elizaos/shared";

export function trustedDevRendererUrl(
  configuredUrl: string | undefined,
  isPackaged: boolean,
): string | undefined {
  if (isPackaged || !configuredUrl?.trim()) return undefined;
  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "http:" || !isLoopbackBindHost(parsed.hostname)) {
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
