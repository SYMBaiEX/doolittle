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
      getBot?: () => unknown;
      messageManager?: unknown;
      knownChats?: Map<string, unknown>;
    };
  };
}

type ConnectorPlatform = Exclude<
  EffectiveMessagingTransportEntry["platform"],
  "telegram"
>;

function getSendConnector(runtime: RuntimeLike, platform: ConnectorPlatform) {
  return runtime
    .getMessageConnectors?.()
    .find(
      (connector) =>
        connector.source === platform &&
        connector.capabilities.includes("send_message"),
    );
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
  const telegramBot = native.telegram?.getBot?.();
  const telegramLive = Boolean(
    telegramPlugin?.enabled && telegramBot && native.telegram?.messageManager,
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

function buildConnectorMessagingEntry(
  runtime: RuntimeLike,
  gatewayConfig: GatewayConfig | undefined,
  platform: ConnectorPlatform,
  configEnabled: boolean,
  plugin: NativePluginEntry | undefined,
): EffectiveMessagingTransportEntry {
  const connector = getSendConnector(runtime, platform);
  const live = Boolean(plugin?.enabled && connector);

  return {
    platform,
    pluginId: plugin?.id,
    pluginSource: plugin?.source,
    configEnabled,
    pluginEnabled: Boolean(plugin?.enabled),
    gatewayEnabled: isTransportGatewayEnabled(gatewayConfig, platform),
    serviceName: `message_connector:${platform}`,
    serviceAvailable: Boolean(connector),
    live,
    reason: live
      ? "live"
      : plugin?.enabled
        ? "service-unavailable"
        : configEnabled
          ? "plugin-disabled"
          : "not-configured",
    detail: live
      ? `${connector?.label ?? platform} message connector is registered.`
      : plugin?.enabled
        ? `${platform} plugin is enabled but its send connector is not registered.`
        : `${platform} plugin is disabled.`,
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
  const pluginFor = (platform: ConnectorPlatform) =>
    catalog.find((entry) => entry.id === `messaging.${platform}`);

  return [
    buildTelegramMessagingEntry(runtime, config, gatewayConfig, telegramPlugin),
    buildConnectorMessagingEntry(
      runtime,
      gatewayConfig,
      "discord",
      Boolean(config.discordBotToken),
      pluginFor("discord"),
    ),
    buildConnectorMessagingEntry(
      runtime,
      gatewayConfig,
      "slack",
      Boolean(config.slackBotToken && config.slackAppToken),
      pluginFor("slack"),
    ),
    buildConnectorMessagingEntry(
      runtime,
      gatewayConfig,
      "whatsapp",
      Boolean(
        config.whatsappAccessToken &&
          config.whatsappPhoneNumberId &&
          config.whatsappVerifyToken,
      ),
      pluginFor("whatsapp"),
    ),
    buildConnectorMessagingEntry(
      runtime,
      gatewayConfig,
      "signal",
      Boolean(config.signalAccountNumber),
      pluginFor("signal"),
    ),
  ];
}
