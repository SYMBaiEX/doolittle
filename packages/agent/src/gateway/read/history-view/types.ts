import type {
  DeliveredMessageRecord,
  OutboundPlatformMessage,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";
import type { GatewayReceiveOutcome } from "../../receive/outcome-types";

export type { DeliveredMessageRecord, SessionRoute };

export type GatewayTraceKind =
  | "receive"
  | "authorize"
  | "session"
  | "route"
  | "respond"
  | "deliver"
  | "update"
  | "heartbeat"
  | "reject"
  | "lifecycle";

export interface GatewayTraceRecord {
  traceId: string;
  at: string;
  kind: GatewayTraceKind;
  platform: PlatformName | "gateway";
  detail: string;
  sessionId?: string;
  userId?: string;
  roomId?: string;
  messageId?: string;
  threadId?: string;
  replyToMessageId?: string;
  deliveryId?: string;
  metadataKeys?: string[];
}

export interface GatewayInboxRecord {
  recordId: string;
  at: string;
  platform: PlatformName;
  sessionId?: string;
  traceId: string;
  status: "received" | "accepted" | "rejected" | "completed";
  idempotencyKey?: string;
  outcome?: GatewayReceiveOutcome;
  userId: string;
  roomId: string;
  channelId?: string;
  threadId?: string;
  messageId?: string;
  replyToMessageId?: string;
  channelType?: string;
  authorName?: string;
  textPreview: string;
  attachmentCount: number;
  attachmentKinds: string[];
  attachmentNames: string[];
  attachmentUrls: string[];
  attachmentMimeTypes: string[];
  metadataKeys: string[];
  metadata: Record<string, string>;
  notes?: string[];
}

export interface GatewayOutboxRecord {
  recordId: string;
  at: string;
  platform: PlatformName;
  sessionId?: string;
  traceId: string;
  status: "sent" | "fallback" | "rejected" | "edited";
  deliveryId?: string;
  userId?: string;
  roomId: string;
  threadId?: string;
  replyToMessageId?: string;
  textPreview: string;
  attachmentCount: number;
  attachmentKinds: string[];
  attachmentNames: string[];
  attachmentUrls: string[];
  attachmentMimeTypes: string[];
  metadataKeys: string[];
  metadata: Record<string, string>;
  /** Complete intended payload, retained so rejected delivery can be retried. */
  outbound?: OutboundPlatformMessage;
  /** Links an append-only retry result to its original rejected record. */
  retryOfRecordId?: string;
  notes?: string[];
}

export interface GatewayAttachmentRecord {
  attachmentId: string;
  recordId: string;
  at: string;
  direction: "inbox" | "outbox";
  platform: PlatformName;
  sessionId?: string;
  traceId: string;
  deliveryId?: string;
  messageId?: string;
  userId?: string;
  roomId: string;
  threadId?: string;
  replyToMessageId?: string;
  kind: string;
  name?: string;
  url?: string;
  mimeType?: string;
  size?: string;
  caption?: string;
  durationMs?: string;
  width?: string;
  height?: string;
  metadataKeys: string[];
  metadata: Record<string, string>;
}

export interface GatewayHistoryFilter {
  platform?: PlatformName;
  kind?: GatewayTraceKind;
  sessionId?: string;
}

export interface GatewayHistoryViewData {
  traceLog: readonly GatewayTraceRecord[];
  inboxLog: readonly GatewayInboxRecord[];
  outboxLog: readonly GatewayOutboxRecord[];
  attachmentLog: readonly GatewayAttachmentRecord[];
  recentDeliveries(limit: number): DeliveredMessageRecord[];
  listSessions(): readonly SessionRoute[];
}

export interface GatewayHistoryWindow {
  allTraces: GatewayTraceRecord[];
  traces: GatewayTraceRecord[];
  inbox: GatewayInboxRecord[];
  outbox: GatewayOutboxRecord[];
  attachments: GatewayAttachmentRecord[];
  deliveries: DeliveredMessageRecord[];
  sessions: SessionRoute[];
}
