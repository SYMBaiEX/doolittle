import type { IAgentRuntime } from "@elizaos/core";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import {
  getNativeMessagingTransportState,
  getNativeTransportControlPlane,
} from "@/runtime/native/service-bridge/transport-control";
import type { GatewayConfig, PlatformName } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";

export function resolveNativeMessagingPlugin(options: {
  config: EnvConfig;
  gatewayConfig: GatewayConfig;
  runtime: IAgentRuntime;
  platform: PlatformName;
}) {
  const suffix = `.${options.platform}`;
  const plugin = getNativePluginCatalog(options.config).find(
    (entry) => entry.category === "messaging" && entry.id.endsWith(suffix),
  );
  const nativeState =
    options.platform === "telegram" || options.platform === "discord"
      ? getNativeMessagingTransportState(
          options.runtime,
          options.config,
          options.gatewayConfig,
          options.platform,
        )
      : undefined;
  const bridge = getNativeTransportControlPlane(
    options.runtime,
    options.config,
    options.gatewayConfig,
  ).messagingBridge.find((entry) => entry.platform === options.platform);

  if (!plugin) {
    return bridge
      ? {
          id: bridge.pluginId,
          source: bridge.pluginSource,
          enabled: bridge.pluginEnabled,
          notes: nativeState
            ? `${nativeState.summary} ${nativeState.detail}`
            : bridge.detail,
        }
      : undefined;
  }

  return {
    ...plugin,
    notes: bridge
      ? `${plugin.notes} ${
          nativeState
            ? `${nativeState.summary} ${nativeState.detail}`
            : bridge.detail
        }`
      : plugin.notes,
  };
}
