import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type { RuntimeLike } from "../runtime-contracts";
import { getMessagingPluginCatalog } from "./catalog";
import { getEffectiveTransportInventory } from "./inventory";
import { getEffectiveMessagingTransportInventory } from "./messaging";
import type {
  EffectiveMessagingTransportEntry,
  EffectiveTransportInventoryEntry,
} from "./types";

function buildTransportTotals(
  messagingBridge: EffectiveMessagingTransportEntry[],
  transportInventory: EffectiveTransportInventoryEntry[],
) {
  return {
    configured: messagingBridge.length,
    enabledPlugins: messagingBridge.filter((entry) => entry.pluginEnabled)
      .length,
    gatewayEnabled: transportInventory.filter((entry) => entry.gatewayEnabled)
      .length,
    availableServices: messagingBridge.filter((entry) => entry.serviceAvailable)
      .length,
    liveServices: messagingBridge.filter((entry) => entry.live).length,
    officialPlugins: messagingBridge.filter(
      (entry) => entry.pluginSource === "official",
    ).length,
    vendoredPlugins: messagingBridge.filter(
      (entry) => entry.pluginSource === "vendored",
    ).length,
    operationalTransports: transportInventory.filter(
      (entry) => entry.operational,
    ).length,
    customTransports: transportInventory.filter(
      (entry) => entry.source === "custom",
    ).length,
    productTransports: transportInventory.filter(
      (entry) => entry.source === "product",
    ).length,
  };
}

export function getNativeTransportControlPlane(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
) {
  const messagingPlugins = getMessagingPluginCatalog(config);
  const messagingBridge = getEffectiveMessagingTransportInventory(
    runtime,
    config,
    gatewayConfig,
  );
  const transportInventory = getEffectiveTransportInventory(
    runtime,
    config,
    gatewayConfig,
  );

  return {
    messagingBridge,
    messagingPlugins,
    transportInventory,
    totals: buildTransportTotals(messagingBridge, transportInventory),
  };
}

export type NativeTransportControlPlane = ReturnType<
  typeof getNativeTransportControlPlane
>;
