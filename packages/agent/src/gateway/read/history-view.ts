import type {
  DeliveredMessageRecord,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";

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
  status: "received" | "accepted" | "rejected";
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

interface GatewayHistoryViewData {
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

export class GatewayHistoryView {
  constructor(private readonly data: GatewayHistoryViewData) {}

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.filteredTraces(filters).slice(-limit).reverse();
  }

  inbox(limit = 20, filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.filteredInbox(filters).slice(-limit).reverse();
  }

  outbox(limit = 20, filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return this.filteredOutbox(filters).slice(-limit).reverse();
  }

  attachments(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.filteredAttachments(filters).slice(-limit).reverse();
  }

  snapshotWindow(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayHistoryWindow {
    const allTraces = this.filteredTraces(filters);
    const traces = allTraces.slice(-limit).reverse();
    const inbox = this.filteredInbox(filters).slice(-limit).reverse();
    const outbox = this.filteredOutbox(filters).slice(-limit).reverse();
    const attachments = this.filteredAttachments(filters)
      .slice(-limit)
      .reverse();
    return {
      allTraces,
      traces,
      inbox,
      outbox,
      attachments,
      deliveries: this.recentDeliveries(limit, filters?.platform),
      sessions: this.recentSessions(limit, filters?.platform),
    };
  }

  private filteredTraces(filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.data.traceLog.filter((trace) => {
      if (filters?.platform && trace.platform !== filters.platform) {
        return false;
      }
      if (filters?.kind && trace.kind !== filters.kind) {
        return false;
      }
      if (filters?.sessionId && trace.sessionId !== filters.sessionId) {
        return false;
      }
      return true;
    });
  }

  private filteredInbox(filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.data.inboxLog.filter((record) => {
      if (filters?.platform && record.platform !== filters.platform) {
        return false;
      }
      if (filters?.sessionId && record.sessionId !== filters.sessionId) {
        return false;
      }
      return true;
    });
  }

  private filteredOutbox(
    filters?: GatewayHistoryFilter,
  ): GatewayOutboxRecord[] {
    return this.data.outboxLog.filter((record) => {
      if (filters?.platform && record.platform !== filters.platform) {
        return false;
      }
      if (filters?.sessionId && record.sessionId !== filters.sessionId) {
        return false;
      }
      return true;
    });
  }

  private filteredAttachments(
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.data.attachmentLog.filter((record) => {
      if (filters?.platform && record.platform !== filters.platform) {
        return false;
      }
      if (filters?.sessionId && record.sessionId !== filters.sessionId) {
        return false;
      }
      return true;
    });
  }

  private recentDeliveries(
    limit = 20,
    platform?: PlatformName,
  ): DeliveredMessageRecord[] {
    const records = this.data.recentDeliveries(Math.max(limit * 4, 50));
    const filtered = platform
      ? records.filter((record) => record.target.platform === platform)
      : records;
    return filtered.slice(0, limit);
  }

  private recentSessions(limit = 20, platform?: PlatformName): SessionRoute[] {
    const sessions = this.data
      .listSessions()
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const filtered = platform
      ? sessions.filter((session) => session.platform === platform)
      : sessions;
    return filtered.slice(0, limit);
  }
}
