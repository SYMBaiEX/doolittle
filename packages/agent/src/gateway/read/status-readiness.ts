import type { PlatformName } from "@/types/gateway";
import type { PlatformHealth, PlatformPresenceState } from "../platforms/base";
import { capabilitiesForPlatform } from "../platforms/base";

export const LIGHTWEIGHT_WEBHOOK_PLATFORMS = new Set<PlatformName>([
  "signal",
  "matrix",
  "email",
  "sms",
]);

export const NATIVE_PLATFORM_ADAPTERS = new Set<PlatformName>([
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
]);

interface GatewayPlatformStateForMerge {
  lastUpdatedAt?: string;
  lastDeliveryAt?: string;
  lastDeliveryId?: string;
  lastOutboundRoomId?: string;
  lastOutboundUserId?: string;
  lastOutboundThreadId?: string;
  lastOutboundReplyToId?: string;
  lastOutboundMetadataKeys?: string[];
  lastReceivedAt?: string;
  lastRoutedAt?: string;
  lastRespondedAt?: string;
  lastHeartbeatAt?: string;
  sendCount?: number;
  lastError?: string;
  presence?: PlatformPresenceState;
  events?: {
    at: string;
    kind: string;
    detail: string;
  }[];
}

export interface GatewayTransportInventoryEntry {
  operational: boolean;
  detail: string;
  reason?:
    | "live"
    | "gateway-disabled"
    | "not-configured"
    | "plugin-disabled"
    | "service-unavailable"
    | "custom-ready";
}

export interface CollectGatewayReadinessArgs {
  readonly configuredPlatforms: readonly PlatformName[];
  getAdapterPlatforms: () => IterableIterator<PlatformName>;
  getAdapterHealth: (platform: PlatformName) => Promise<PlatformHealth>;
  isPlatformEnabled: (platform: PlatformName) => boolean;
  syncPlatformStateFromHealth: (health: PlatformHealth) => void;
  mergePlatformHealth: (health: PlatformHealth) => PlatformHealth;
}

export interface MergeGatewayPlatformHealthArgs {
  health: PlatformHealth;
  getPlatformState: (platform: PlatformName) => GatewayPlatformStateForMerge;
  getTransportInventoryEntry: (
    platform: PlatformName,
  ) => GatewayTransportInventoryEntry | undefined;
}

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

export async function collectGatewayReadiness(
  args: CollectGatewayReadinessArgs,
): Promise<PlatformHealth[]> {
  const configuredPlatforms = args.configuredPlatforms;
  const knownPlatforms = new Set(Array.from(args.getAdapterPlatforms()));

  const startedHealth = await Promise.all(
    Array.from(knownPlatforms).map(async (platform) => {
      const health = await args.getAdapterHealth(platform);
      args.syncPlatformStateFromHealth(health);
      return args.mergePlatformHealth(health);
    }),
  );

  const inactiveHealth = configuredPlatforms
    .filter((platform) => !knownPlatforms.has(platform))
    .map((platform) => {
      const inactive: PlatformHealth = {
        platform,
        status: "stopped",
        ready: false,
        mode: isNativeGatewayPlatform(platform) ? "native" : "mock",
        capabilities: capabilitiesForPlatform(platform),
        detail: describeInactivePlatform(
          platform,
          args.isPlatformEnabled(platform),
        ),
        events: [
          {
            at: new Date().toISOString(),
            kind: "health",
            detail: describeInactivePlatform(
              platform,
              args.isPlatformEnabled(platform),
            ),
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
