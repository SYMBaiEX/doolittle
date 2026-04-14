import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import { getNativeServices } from "../../runtime";
import type { RuntimeLike } from "../../runtime-contracts";
import type {
  EffectiveMessagingTransportEntry,
  NativePluginEntry,
} from "../types";
import { isTransportGatewayEnabled } from "./gateway";

function getNativeMessagingServices(runtime: RuntimeLike) {
  return getNativeServices(runtime) as {
    telegram?: {
      bot?: unknown;
      messageManager?: unknown;
      knownChats?: Map<string, unknown>;
    };
    discordTransport?: {
      history?: () => unknown;
    };
  };
}

function buildTelegramMessagingEntry(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig: GatewayConfig | undefined,
  telegramPlugin: NativePluginEntry | undefined,
): EffectiveMessagingTransportEntry {
  const native = getNativeMessagingServices(runtime);
  const telegramKnownChats =
    native.telegram?.knownChats instanceof Map
      ? native.telegram.knownChats.size
      : 0;
  const telegramLive = Boolean(
    telegramPlugin?.enabled &&
      native.telegram?.bot &&
      native.telegram?.messageManager,
  );

  return {
    platform: "telegram",
    pluginId: telegramPlugin?.id,
    pluginSource: telegramPlugin?.source,
    configEnabled: Boolean(config.telegramBotToken),
    pluginEnabled: Boolean(telegramPlugin?.enabled),
    gatewayEnabled: isTransportGatewayEnabled(gatewayConfig, "telegram"),
    serviceName: "telegram",
    serviceAvailable: Boolean(native.telegram),
    live: telegramLive,
    reason: telegramLive
      ? "live"
      : telegramPlugin?.enabled
        ? "service-unavailable"
        : config.telegramBotToken
          ? "plugin-disabled"
          : "not-configured",
    detail: telegramLive
      ? `telegram service live; knownChats=${telegramKnownChats}`
      : telegramPlugin?.enabled
        ? "telegram plugin enabled but runtime service not fully live"
        : "telegram plugin disabled",
  };
}

function buildDiscordMessagingEntry(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig: GatewayConfig | undefined,
  discordPlugin: NativePluginEntry | undefined,
): EffectiveMessagingTransportEntry {
  const native = getNativeMessagingServices(runtime);
  const discordLive = Boolean(
    discordPlugin?.enabled &&
      native.discordTransport &&
      typeof native.discordTransport?.history === "function",
  );

  return {
    platform: "discord",
    pluginId: discordPlugin?.id,
    pluginSource: discordPlugin?.source,
    configEnabled: Boolean(config.discordBotToken),
    pluginEnabled: Boolean(discordPlugin?.enabled),
    gatewayEnabled: isTransportGatewayEnabled(gatewayConfig, "discord"),
    serviceName: "discord_transport",
    serviceAvailable: Boolean(native.discordTransport),
    live: discordLive,
    reason: discordLive
      ? "live"
      : discordPlugin?.enabled
        ? "service-unavailable"
        : config.discordBotToken
          ? "plugin-disabled"
          : "not-configured",
    detail: discordLive
      ? "discord transport service available through native bridge"
      : discordPlugin?.enabled
        ? "discord plugin enabled but runtime service not fully live"
        : "discord plugin disabled",
  };
}

export function getEffectiveMessagingTransportInventoryEntries(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): EffectiveMessagingTransportEntry[] {
  const catalog = getNativePluginCatalog(config);
  const telegramPlugin = catalog.find(
    (entry) => entry.id === "messaging.telegram",
  );
  const discordPlugin = catalog.find(
    (entry) => entry.id === "messaging.discord",
  );

  return [
    buildTelegramMessagingEntry(runtime, config, gatewayConfig, telegramPlugin),
    buildDiscordMessagingEntry(runtime, config, gatewayConfig, discordPlugin),
  ];
}
