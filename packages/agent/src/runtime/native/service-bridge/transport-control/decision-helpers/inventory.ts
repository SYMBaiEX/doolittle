import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type {
  EffectiveMessagingTransportEntry,
  EffectiveTransportInventoryEntry,
  TransportPlatform,
} from "../types";
import {
  isCustomTransportConfigured,
  isTransportGatewayEnabled,
} from "./gateway";

export function buildEffectiveTransportInventoryEntry(
  platform: TransportPlatform,
  config: EnvConfig,
  gatewayConfig: GatewayConfig | undefined,
  messagingEntry?: EffectiveMessagingTransportEntry,
): EffectiveTransportInventoryEntry {
  if (platform === "telegram" || platform === "discord") {
    if (!messagingEntry) {
      return {
        platform,
        source: "custom",
        configEnabled: false,
        gatewayEnabled: isTransportGatewayEnabled(gatewayConfig, platform),
        operational: false,
        reason: "not-configured",
        detail: `${platform} transport is not configured.`,
      };
    }
    return {
      platform,
      source: messagingEntry.pluginSource ?? "custom",
      configEnabled: messagingEntry.configEnabled,
      gatewayEnabled: messagingEntry.gatewayEnabled,
      operational: messagingEntry.live && messagingEntry.gatewayEnabled,
      reason: !messagingEntry.gatewayEnabled
        ? "gateway-disabled"
        : messagingEntry.reason,
      detail: !messagingEntry.gatewayEnabled
        ? `${platform} transport is disabled in gateway config.`
        : messagingEntry.detail,
      pluginId: messagingEntry.pluginId,
      serviceName: messagingEntry.serviceName,
      serviceAvailable: messagingEntry.serviceAvailable,
    };
  }

  const configEnabled = isCustomTransportConfigured(platform, config);
  const gatewayEnabled = isTransportGatewayEnabled(gatewayConfig, platform);
  const operational = configEnabled && gatewayEnabled;

  return {
    platform,
    source: platform === "api" || platform === "cli" ? "product" : "custom",
    configEnabled,
    gatewayEnabled,
    operational,
    reason: operational
      ? "custom-ready"
      : !gatewayEnabled
        ? "gateway-disabled"
        : "not-configured",
    detail: operational
      ? `${platform} transport is configured and enabled.`
      : !gatewayEnabled
        ? `${platform} transport is disabled in gateway config.`
        : `${platform} transport is not configured.`,
  };
}
