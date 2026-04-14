import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type { GatewayNativeMessagingStateView } from "@/gateway/state/state-snapshot";
import { getNativeMessagingTransportState } from "@/runtime/native/service-bridge/transport-control";
import type { PlatformName } from "@/types/gateway";

export interface GatewayRunnerPlatformAccessors {
  getConfiguredPlatforms(): PlatformName[];
  isPlatformEnabled(platform: PlatformName): boolean;
  getNativeMessagingState(
    platform: PlatformName,
  ): GatewayNativeMessagingStateView | undefined;
}

export function isGatewayNativeMessagingPlatform(
  platform: PlatformName,
): platform is "telegram" | "discord" {
  return platform === "telegram" || platform === "discord";
}

export function createGatewayRunnerPlatformAccessors(
  context: GatewayRunnerContext,
): GatewayRunnerPlatformAccessors {
  return {
    getConfiguredPlatforms: () =>
      Object.keys(context.services.gatewayConfig.platforms) as PlatformName[],
    isPlatformEnabled: (platform) => {
      const platformConfig =
        context.services.gatewayConfig.platforms[
          platform as keyof typeof context.services.gatewayConfig.platforms
        ];
      return platformConfig?.enabled ?? false;
    },
    getNativeMessagingState: (platform) =>
      isGatewayNativeMessagingPlatform(platform)
        ? getNativeMessagingTransportState(
            context.runtime,
            context.config,
            context.services.gatewayConfig,
            platform,
          )
        : undefined,
  };
}
