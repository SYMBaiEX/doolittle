import { parseTransportPlatform } from "@/gateway/control/index";
import type { PlatformName } from "@/types";

export function resolveGatewayPlatformSelection(
  rawPlatform: string | undefined,
): PlatformName | "all" | undefined {
  return rawPlatform?.trim().toLowerCase() === "all"
    ? "all"
    : rawPlatform
      ? parseTransportPlatform(rawPlatform)
      : "all";
}

export function normalizeGatewayReason(reason: string | undefined): string {
  return reason?.trim() || "api";
}
