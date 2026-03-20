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
