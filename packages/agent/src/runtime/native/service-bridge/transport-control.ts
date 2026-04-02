import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog/index";
import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type { RuntimeLike } from "./runtime-contracts";
import {
  buildEffectiveTransportInventoryEntry,
  getEffectiveMessagingTransportInventoryEntries,
} from "./transport-control/decision-helpers";

export interface EffectiveTransportInventoryEntry {
  platform:
    | "api"
    | "cli"
    | "telegram"
    | "discord"
    | "slack"
    | "whatsapp"
    | "signal"
    | "matrix"
    | "email"
    | "sms"
    | "mattermost"
    | "homeassistant"
    | "dingtalk";
  source: "official" | "vendored" | "custom" | "product";
  configEnabled: boolean;
  gatewayEnabled: boolean;
  operational: boolean;
  reason:
    | "live"
    | "gateway-disabled"
    | "not-configured"
    | "plugin-disabled"
    | "service-unavailable"
    | "custom-ready";
  detail: string;
  pluginId?: string;
  serviceName?: string;
  serviceAvailable?: boolean;
}

export interface EffectiveMessagingTransportEntry {
  platform: "telegram" | "discord";
  pluginId?: string;
  pluginSource?: "official" | "vendored" | "custom";
  configEnabled: boolean;
  pluginEnabled: boolean;
  gatewayEnabled: boolean;
  serviceName: string;
  serviceAvailable: boolean;
  live: boolean;
  reason: "live" | "not-configured" | "plugin-disabled" | "service-unavailable";
  detail: string;
}

export interface NativeMessagingTransportState
  extends EffectiveMessagingTransportEntry {
  ready: boolean;
  summary: string;
}

const ALL_TRANSPORT_PLATFORMS: EffectiveTransportInventoryEntry["platform"][] =
  [
    "api",
    "cli",
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "matrix",
    "email",
    "sms",
    "mattermost",
    "homeassistant",
    "dingtalk",
  ];

export function getEffectiveMessagingTransportInventory(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): EffectiveMessagingTransportEntry[] {
  return getEffectiveMessagingTransportInventoryEntries(
    runtime,
    config,
    gatewayConfig,
  );
}

export function getNativeMessagingTransportState(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig: GatewayConfig | undefined,
  platform: "telegram" | "discord",
): NativeMessagingTransportState | undefined {
  const entry = getEffectiveMessagingTransportInventory(
    runtime,
    config,
    gatewayConfig,
  ).find((transport) => transport.platform === platform);
  if (!entry) {
    return undefined;
  }
  const ready = entry.live && entry.gatewayEnabled;
  return {
    ...entry,
    ready,
    summary: [
      `${platform}:`,
      `config=${entry.configEnabled}`,
      `gateway=${entry.gatewayEnabled}`,
      `plugin=${entry.pluginEnabled}`,
      `service=${entry.serviceAvailable}`,
      `live=${entry.live}`,
      `ready=${ready}`,
      `reason=${entry.reason}`,
    ].join(" "),
  };
}

export function getEffectiveTransportInventory(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): EffectiveTransportInventoryEntry[] {
  const messagingBridge = getEffectiveMessagingTransportInventory(
    runtime,
    config,
    gatewayConfig,
  );
  const messagingMap = new Map<
    EffectiveTransportInventoryEntry["platform"],
    EffectiveMessagingTransportEntry
  >(messagingBridge.map((entry) => [entry.platform, entry]));

  return ALL_TRANSPORT_PLATFORMS.map((platform) =>
    buildEffectiveTransportInventoryEntry(
      platform,
      config,
      gatewayConfig,
      messagingMap.get(platform),
    ),
  );
}

export function getNativeTransportControlPlane(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): {
  messagingBridge: ReturnType<typeof getEffectiveMessagingTransportInventory>;
  messagingPlugins: ReturnType<typeof getNativePluginCatalog>;
  transportInventory: EffectiveTransportInventoryEntry[];
  totals: {
    configured: number;
    enabledPlugins: number;
    gatewayEnabled: number;
    availableServices: number;
    liveServices: number;
    officialPlugins: number;
    vendoredPlugins: number;
    operationalTransports: number;
    customTransports: number;
    productTransports: number;
  };
} {
  const messagingPlugins = getNativePluginCatalog(config).filter(
    (entry: { category?: string }) => entry.category === "messaging",
  );
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
    totals: {
      configured: messagingBridge.length,
      enabledPlugins: messagingBridge.filter((entry) => entry.pluginEnabled)
        .length,
      gatewayEnabled: transportInventory.filter((entry) => entry.gatewayEnabled)
        .length,
      availableServices: messagingBridge.filter(
        (entry) => entry.serviceAvailable,
      ).length,
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
    },
  };
}
