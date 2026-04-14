import type { PlatformHealth } from "../../platforms/base";
import { capabilitiesForPlatform } from "../../platforms/base";
import { describeInactivePlatform, isNativeGatewayPlatform } from "./helpers";
import type {
  CollectGatewayReadinessArgs,
  MergeGatewayPlatformHealthArgs,
} from "./types";

export async function collectGatewayReadiness(
  args: CollectGatewayReadinessArgs,
): Promise<PlatformHealth[]> {
  const knownPlatforms = new Set(Array.from(args.getAdapterPlatforms()));

  const startedHealth = await Promise.all(
    Array.from(knownPlatforms).map(async (platform) => {
      const health = await args.getAdapterHealth(platform);
      args.syncPlatformStateFromHealth(health);
      return args.mergePlatformHealth(health);
    }),
  );

  const inactiveHealth = args.configuredPlatforms
    .filter((platform) => !knownPlatforms.has(platform))
    .map((platform) => {
      const detail = describeInactivePlatform(
        platform,
        args.isPlatformEnabled(platform),
      );
      const inactive: PlatformHealth = {
        platform,
        status: "stopped",
        ready: false,
        mode: isNativeGatewayPlatform(platform) ? "native" : "mock",
        capabilities: capabilitiesForPlatform(platform),
        detail,
        events: [
          {
            at: new Date().toISOString(),
            kind: "health",
            detail,
          },
        ],
        presence: {
          status: "offline",
          activity: `${platform} transport is inactive`,
          lastPresenceChangeAt: new Date().toISOString(),
        },
      };

      args.syncPlatformStateFromHealth(inactive);
      return args.mergePlatformHealth(inactive);
    });

  return [...startedHealth, ...inactiveHealth];
}

export function mergePlatformHealthState(
  args: MergeGatewayPlatformHealthArgs,
): PlatformHealth {
  const { health, getPlatformState, getTransportInventoryEntry } = args;
  const state = getPlatformState(health.platform);
  const inventory = getTransportInventoryEntry(health.platform);

  const inventoryDetail = inventory?.detail;
  const detail =
    inventoryDetail && inventoryDetail !== health.detail
      ? `${inventoryDetail} ${health.detail}`
      : (inventoryDetail ?? health.detail);
  const ready = inventory
    ? inventory.operational && health.ready
    : health.ready;
  const lastError =
    health.lastError ??
    (!ready &&
    inventory &&
    inventory.reason !== "live" &&
    inventory.reason !== "custom-ready"
      ? inventory.detail
      : undefined);

  return {
    ...health,
    ready,
    detail,
    lastSendAt: health.lastSendAt ?? state.lastUpdatedAt,
    lastDeliveryAt: health.lastDeliveryAt ?? state.lastDeliveryAt,
    lastDeliveryId: health.lastDeliveryId ?? state.lastDeliveryId,
    lastOutboundRoomId: health.lastOutboundRoomId ?? state.lastOutboundRoomId,
    lastOutboundUserId: health.lastOutboundUserId ?? state.lastOutboundUserId,
    lastOutboundThreadId:
      health.lastOutboundThreadId ?? state.lastOutboundThreadId,
    lastOutboundReplyToId:
      health.lastOutboundReplyToId ?? state.lastOutboundReplyToId,
    lastOutboundMetadataKeys:
      health.lastOutboundMetadataKeys ?? state.lastOutboundMetadataKeys,
    lastReceivedAt: health.lastReceivedAt ?? state.lastReceivedAt,
    lastRoutedAt: health.lastRoutedAt ?? state.lastRoutedAt,
    lastRespondedAt: health.lastRespondedAt ?? state.lastRespondedAt,
    lastHeartbeatAt: health.lastHeartbeatAt ?? state.lastHeartbeatAt,
    sendCount: health.sendCount ?? state.sendCount,
    lastError,
    presence: health.presence ?? state.presence,
    events: health.events,
  };
}
