import type { PlatformName } from "@/types/gateway";

import { GATEWAY_TRACE_KINDS, TRANSPORT_PLATFORM_NAMES } from "./constants";
import type {
  GatewayFilterOptions,
  GatewayFilterSelection,
  GatewayTraceKind,
} from "./types";

export function parseTransportPlatform(raw: string): PlatformName | undefined {
  const platform = raw.trim().toLowerCase();
  return TRANSPORT_PLATFORM_NAMES.includes(platform as PlatformName)
    ? (platform as PlatformName)
    : undefined;
}

export function parseGatewayFiltersFromUrl(
  url: URL,
  fallbackLimit = 25,
): GatewayFilterSelection {
  const rawLimit = Number(url.searchParams.get("limit") ?? `${fallbackLimit}`);
  const platform = url.searchParams.get("platform") ?? undefined;
  const sessionId =
    url.searchParams.get("sessionId") ??
    url.searchParams.get("session") ??
    undefined;
  const kind = url.searchParams.get("kind") ?? undefined;

  return {
    limit: Number.isNaN(rawLimit) || rawLimit <= 0 ? fallbackLimit : rawLimit,
    platform: platform ? parseTransportPlatform(platform) : undefined,
    sessionId,
    kind:
      kind && GATEWAY_TRACE_KINDS.includes(kind as GatewayTraceKind)
        ? (kind as GatewayTraceKind)
        : undefined,
  };
}

export function parseGatewayFiltersFromText(raw: string): GatewayFilterOptions {
  const options: GatewayFilterOptions = {};

  for (const token of raw.split(/\s+/u).filter(Boolean)) {
    if (token.startsWith("limit:")) {
      const limit = Number(token.replace("limit:", "").trim());
      if (!Number.isNaN(limit) && limit > 0) {
        options.limit = limit;
      }
      continue;
    }

    if (token.startsWith("platform:")) {
      const platform = parseTransportPlatform(
        token.replace("platform:", "").trim(),
      );
      if (platform) {
        options.platform = platform;
      }
      continue;
    }

    if (token.startsWith("session:") || token.startsWith("sessionId:")) {
      options.sessionId = token.replace(/^session(Id)?:/u, "").trim();
      continue;
    }

    if (token.startsWith("kind:")) {
      const kind = token.replace("kind:", "").trim();
      if (GATEWAY_TRACE_KINDS.includes(kind as GatewayTraceKind)) {
        options.kind = kind as GatewayTraceKind;
      }
    }
  }

  return options;
}
