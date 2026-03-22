import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
} from "@/types";

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

export function buildConfiguredTransportHealth(
  input: TransportHealthInput,
): PlatformHealth {
  const readyWhenRunning = input.readyWhenRunning ?? true;
  const ready =
    input.status === "running" && readyWhenRunning && input.configured;
  const detail = input.configured
    ? input.status === "running"
      ? input.runningDetail
      : (input.stoppedDetail ?? input.configuredDetail)
    : input.missingDetail;
  return {
    platform: input.platform,
    status: input.status,
    ready,
    mode: input.mode ?? "native",
    capabilities: input.capabilities,
    detail,
    startedAt: input.startedAt,
    stoppedAt: input.stoppedAt,
    lastSendAt: input.lastSendAt,
    lastDeliveryAt: input.lastDeliveryAt,
    lastDeliveryId: input.lastDeliveryId,
    lastOutboundRoomId: input.lastOutboundRoomId,
    lastOutboundUserId: input.lastOutboundUserId,
    lastOutboundThreadId: input.lastOutboundThreadId,
    lastOutboundReplyToId: input.lastOutboundReplyToId,
    lastOutboundMetadataKeys: input.lastOutboundMetadataKeys,
    lastWatchAt: input.lastWatchAt,
    lastWatchCount: input.lastWatchCount,
    lastWatchSummary: input.lastWatchSummary,
    sendCount: input.sendCount,
    lastError: input.lastError,
    events: input.events,
  };
}

export function formatTransportDisplayName(platform: PlatformName): string {
  switch (platform) {
    case "telegram":
      return "Telegram";
    case "discord":
      return "Discord";
    case "slack":
      return "Slack";
    case "whatsapp":
      return "WhatsApp";
    case "signal":
      return "Signal";
    case "matrix":
      return "Matrix";
    case "email":
      return "Email";
    case "sms":
      return "SMS";
    case "mattermost":
      return "Mattermost";
    case "homeassistant":
      return "Home Assistant";
    case "dingtalk":
      return "DingTalk";
    case "api":
      return "API";
    case "cli":
      return "CLI";
    default:
      return platform;
  }
}

export function describeTransportHealth(
  platform: PlatformName,
  status: "idle" | "running" | "stopped",
  sendCount: number,
  ready: boolean,
): string {
  return `${formatTransportDisplayName(platform)} health check: status=${status} sends=${sendCount} ready=${ready}.`;
}

export function trackTransportStart(
  platform: PlatformName,
  configured: boolean,
  startedDetail: string,
  missingDetail: string,
  lifecycle: LifecycleHistory,
): {
  status: "idle" | "running" | "stopped";
  startedAt?: string;
  lastError?: string;
} {
  if (configured) {
    lifecycle.record("start", `${platform}: ${startedDetail}`);
    return {
      status: "running",
      startedAt: nowIso(),
      lastError: undefined,
    };
  }
  const lastError = missingDetail;
  lifecycle.record("error", `${platform}: ${lastError}`);
  return {
    status: "stopped",
    lastError,
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createLifecycleHistory(limit = 12): LifecycleHistory {
  const events: PlatformLifecycleEvent[] = [];

  return {
    record(kind, detail) {
      const event = {
        at: nowIso(),
        kind,
        detail,
      };
      events.push(event);
      if (events.length > limit) {
        events.splice(0, events.length - limit);
      }
      return event;
    },
    recent(recentLimit = limit) {
      return events.slice(-recentLimit).reverse();
    },
    total() {
      return events.length;
    },
  };
}

export function capabilitiesForPlatform(
  platform: PlatformName,
): PlatformCapabilitySet {
  switch (platform) {
    case "telegram":
      return {
        inbound: true,
        outbound: true,
        edits: true,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "discord":
      return {
        inbound: true,
        outbound: true,
        edits: true,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "slack":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: false,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "whatsapp":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: false,
        metadata: true,
      };
    case "signal":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: false,
        metadata: true,
      };
    case "matrix":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "email":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: false,
        metadata: true,
      };
    case "sms":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: false,
        replies: true,
        threads: false,
        metadata: true,
      };
    case "mattermost":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "homeassistant":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: false,
        attachments: false,
        replies: false,
        threads: false,
        metadata: true,
      };
    case "dingtalk":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    default:
      return {
        inbound: true,
        outbound: true,
        edits: true,
        pairing: true,
        attachments: false,
        replies: false,
        threads: false,
        metadata: false,
      };
  }
}
