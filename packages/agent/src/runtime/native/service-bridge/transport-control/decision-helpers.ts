import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog/index";
import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import { getNativeServices } from "../runtime";
import type { RuntimeLike } from "../runtime-contracts";
import type {
  EffectiveMessagingTransportEntry,
  EffectiveTransportInventoryEntry,
} from "../transport-control";

type TransportPlatform = EffectiveTransportInventoryEntry["platform"];

type NativePluginEntry = {
  id: string;
  source?: "official" | "vendored" | "custom";
  enabled?: boolean;
};

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

export function isTransportGatewayEnabled(
  gatewayConfig: GatewayConfig | undefined,
  platform: TransportPlatform,
): boolean {
  return Boolean(gatewayConfig?.platforms[platform].enabled);
}

export function isCustomTransportConfigured(
  platform: TransportPlatform,
  config: EnvConfig,
): boolean {
  switch (platform) {
    case "api":
    case "cli":
      return true;
    case "slack":
      return Boolean(config.slackWebhookUrl && config.slackSigningSecret);
    case "whatsapp":
      return Boolean(
        config.whatsappAccessToken &&
          config.whatsappPhoneNumberId &&
          config.whatsappVerifyToken,
      );
    case "signal":
      return Boolean(config.signalCliCommand);
    case "matrix":
      return Boolean(config.matrixHomeserver && config.matrixAccessToken);
    case "email":
      return Boolean(config.emailSendCommand);
    case "sms":
      return Boolean(config.smsSendCommand);
    case "mattermost":
      return Boolean(config.mattermostUrl && config.mattermostToken);
    case "homeassistant":
      return Boolean(config.homeAssistantUrl && config.homeAssistantToken);
    case "dingtalk":
      return Boolean(config.dingtalkWebhookUrl || config.dingtalkAccessToken);
    case "telegram":
    case "discord":
      return false;
  }
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
