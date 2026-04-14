import type { PlatformName } from "@/types/gateway";
import { capabilitiesForPlatform } from "../../platforms/base";
import {
  LIGHTWEIGHT_WEBHOOK_PLATFORMS,
  NATIVE_PLATFORM_ADAPTERS,
} from "./constants";

export function isNativeGatewayPlatform(platform: PlatformName): boolean {
  return NATIVE_PLATFORM_ADAPTERS.has(platform);
}

export function isLightweightWebhookPlatform(platform: PlatformName): boolean {
  return LIGHTWEIGHT_WEBHOOK_PLATFORMS.has(platform);
}

export function describeInactivePlatform(
  platform: PlatformName,
  isPlatformEnabled: boolean,
): string {
  const capabilitySummary = [
    capabilitiesForPlatform(platform).inbound ? "inbound" : null,
    capabilitiesForPlatform(platform).outbound ? "outbound" : null,
    capabilitiesForPlatform(platform).replies ? "replies" : null,
    capabilitiesForPlatform(platform).threads ? "threads" : null,
  ]
    .filter(Boolean)
    .join(", ");

  if (!isPlatformEnabled) {
    if (isLightweightWebhookPlatform(platform)) {
      return "Lightweight webhook-normalized routing is available when enabled; messages are session-routed and retained in delivery history even without a native adapter.";
    }

    return "Platform is disabled in gateway configuration.";
  }

  if (isLightweightWebhookPlatform(platform)) {
    return `Lightweight webhook-normalized support is active for ${platform}; ${capabilitySummary} are routed through shared session and delivery history.`;
  }

  return `Platform is enabled but the adapter is not running; ${capabilitySummary} remain queued until a native adapter starts.`;
}
