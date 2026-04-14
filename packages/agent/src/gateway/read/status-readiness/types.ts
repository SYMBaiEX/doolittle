import type { PlatformName } from "@/types/gateway";
import type {
  PlatformHealth,
  PlatformPresenceState,
} from "../../platforms/base";

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
