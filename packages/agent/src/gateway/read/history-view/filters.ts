import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "./types";

export function filterTraceRecords(
  traceLog: readonly GatewayTraceRecord[],
  filters?: GatewayHistoryFilter,
): GatewayTraceRecord[] {
  return traceLog.filter((trace) => matchHistoryFilter(trace, filters));
}

export function filterInboxRecords(
  inboxLog: readonly GatewayInboxRecord[],
  filters?: GatewayHistoryFilter,
): GatewayInboxRecord[] {
  return inboxLog.filter((record) => matchHistoryFilter(record, filters));
}

export function filterOutboxRecords(
  outboxLog: readonly GatewayOutboxRecord[],
  filters?: GatewayHistoryFilter,
): GatewayOutboxRecord[] {
  return outboxLog.filter((record) => matchHistoryFilter(record, filters));
}

export function filterAttachmentRecords(
  attachmentLog: readonly GatewayAttachmentRecord[],
  filters?: GatewayHistoryFilter,
): GatewayAttachmentRecord[] {
  return attachmentLog.filter((record) => matchHistoryFilter(record, filters));
}

function matchHistoryFilter(
  entry:
    | Pick<GatewayTraceRecord, "platform" | "sessionId" | "kind">
    | Pick<GatewayInboxRecord, "platform" | "sessionId">
    | Pick<GatewayOutboxRecord, "platform" | "sessionId">
    | Pick<GatewayAttachmentRecord, "platform" | "sessionId">,
  filters?: GatewayHistoryFilter,
): boolean {
  if (!filters) {
    return true;
  }

  if (filters.platform && entry.platform !== filters.platform) {
    return false;
  }

  if (filters.sessionId && entry.sessionId !== filters.sessionId) {
    return false;
  }

  if (
    filters.kind !== undefined &&
    "kind" in entry &&
    entry.kind !== filters.kind
  ) {
    return false;
  }

  return true;
}
