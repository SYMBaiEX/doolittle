import { buildHistoryWindow } from "./builders";
import {
  filterAttachmentRecords,
  filterInboxRecords,
  filterOutboxRecords,
  filterTraceRecords,
} from "./filters";
import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayHistoryViewData,
  GatewayHistoryWindow,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "./types";

export type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayHistoryWindow,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceKind,
  GatewayTraceRecord,
} from "./types";

type GatewayHistoryRecord =
  | GatewayTraceRecord
  | GatewayInboxRecord
  | GatewayOutboxRecord
  | GatewayAttachmentRecord;

export class GatewayHistoryView {
  constructor(private readonly data: GatewayHistoryViewData) {}

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.buildLimitedRecent(this.traces(filters), limit);
  }

  inbox(limit = 20, filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.buildLimitedRecent(this.inboxes(filters), limit);
  }

  outbox(limit = 20, filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return this.buildLimitedRecent(this.outboxes(filters), limit);
  }

  attachments(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.buildLimitedRecent(this.attachmentsList(filters), limit);
  }

  snapshotWindow(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayHistoryWindow {
    return buildHistoryWindow(
      this.traces(filters),
      this.inboxes(filters),
      this.outboxes(filters),
      this.attachmentsList(filters),
      this.data.recentDeliveries,
      this.data.listSessions(),
      limit,
      filters?.platform,
    );
  }

  private traces(filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return filterTraceRecords(this.data.traceLog, filters);
  }

  private inboxes(filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return filterInboxRecords(this.data.inboxLog, filters);
  }

  private outboxes(filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return filterOutboxRecords(this.data.outboxLog, filters);
  }

  private attachmentsList(
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return filterAttachmentRecords(this.data.attachmentLog, filters);
  }

  private buildLimitedRecent<T>(
    records: readonly GatewayHistoryRecord[],
    limit: number,
  ): T[] {
    return records.slice(-limit).reverse() as T[];
  }
}
