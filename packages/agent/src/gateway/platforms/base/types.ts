import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
} from "@/types/gateway";

export type { PlatformName } from "@/types/gateway";

export interface PlatformCapabilitySet {
  inbound: boolean;
  outbound: boolean;
  edits: boolean;
  pairing: boolean;
  attachments: boolean;
  replies: boolean;
  threads: boolean;
  metadata: boolean;
}

export interface PlatformPresenceState {
  status: "online" | "away" | "offline";
  activity: string;
  lastHeartbeatAt?: string;
  lastPresenceChangeAt?: string;
}

export interface PlatformHealth {
  platform: PlatformName;
  nativePluginId?: string;
  nativePluginSource?: "official" | "vendored" | "custom";
  nativePluginEnabled?: boolean;
  nativePluginNotes?: string;
  status: "idle" | "running" | "stopped";
  ready: boolean;
  mode: "native" | "mock";
  capabilities: PlatformCapabilitySet;
  detail: string;
  startedAt?: string;
  stoppedAt?: string;
  lastSendAt?: string;
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
  lastWatchAt?: string;
  lastWatchCount?: number;
  lastWatchSummary?: string;
  sendCount?: number;
  lastError?: string;
  presence?: PlatformPresenceState;
  events: PlatformLifecycleEvent[];
}

export interface PlatformLifecycleEvent {
  at: string;
  kind:
    | "start"
    | "stop"
    | "send"
    | "deliver"
    | "error"
    | "health"
    | "receive"
    | "authorize"
    | "session"
    | "route"
    | "respond"
    | "edit"
    | "heartbeat"
    | "reject"
    | "pair"
    | "attach";
  detail: string;
}

export interface LifecycleHistory {
  record(
    kind: PlatformLifecycleEvent["kind"],
    detail: string,
  ): PlatformLifecycleEvent;
  recent(limit?: number): PlatformLifecycleEvent[];
  total(): number;
}

export interface PlatformAdapter {
  readonly name: PlatformName;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<PlatformHealth>;
  send(message: OutboundPlatformMessage): Promise<DeliveredMessageRecord>;
  watch?(reason?: string): Promise<{
    watchedAt: string;
    count: number;
    summary: string;
  }>;
  edit?(
    delivery: DeliveredMessageRecord,
    message: OutboundPlatformMessage,
  ): Promise<DeliveredMessageRecord>;
  canReceive(): boolean;
  observe?(event: PlatformLifecycleEvent): Promise<void> | void;
}

export type PlatformMessageHandler = (
  message: IncomingPlatformMessage,
) => Promise<string>;

export interface TransportHealthInput {
  platform: PlatformName;
  status: "idle" | "running" | "stopped";
  sendCount: number;
  configured: boolean;
  readyWhenRunning?: boolean;
  configuredDetail: string;
  missingDetail: string;
  runningDetail: string;
  stoppedDetail?: string;
  lastError?: string;
  startedAt?: string;
  stoppedAt?: string;
  lastSendAt?: string;
  lastDeliveryAt?: string;
  lastDeliveryId?: string;
  lastOutboundRoomId?: string;
  lastOutboundUserId?: string;
  lastOutboundThreadId?: string;
  lastOutboundReplyToId?: string;
  lastOutboundMetadataKeys?: string[];
  lastWatchAt?: string;
  lastWatchCount?: number;
  lastWatchSummary?: string;
  events: PlatformLifecycleEvent[];
  capabilities: PlatformCapabilitySet;
  mode?: "native" | "mock";
}
