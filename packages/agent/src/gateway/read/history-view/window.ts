import type { PlatformName, SessionRoute } from "@/types/gateway";
import type {
  DeliveredMessageRecord,
  GatewayAttachmentRecord,
  GatewayHistoryWindow,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "./types";

export function buildRecentWindow<T>(
  records: readonly T[],
  limit: number,
): T[] {
  return records.slice(-limit).reverse();
}

export function buildGatewayWindow(
  allTraces: GatewayTraceRecord[],
  inbox: GatewayInboxRecord[],
  outbox: GatewayOutboxRecord[],
  attachments: GatewayAttachmentRecord[],
  deliveries: DeliveredMessageRecord[],
  sessions: SessionRoute[],
  limit: number,
): GatewayHistoryWindow {
  return {
    allTraces,
    traces: buildRecentWindow(allTraces, limit),
    inbox: buildRecentWindow(inbox, limit),
    outbox: buildRecentWindow(outbox, limit),
    attachments: buildRecentWindow(attachments, limit),
    deliveries,
    sessions,
  };
}

export function resolveRecentDeliveries(
  recentDeliveries: (limit: number) => DeliveredMessageRecord[],
  limit: number,
  platform?: PlatformName,
): DeliveredMessageRecord[] {
  const fetchLimit = Math.max(limit * 4, 50);
  const records = recentDeliveries(fetchLimit);
  const hasPlatformFilter = (entryPlatform: PlatformName) =>
    platform === undefined || entryPlatform === platform;
  const filtered = platform
    ? records.filter((record) => hasPlatformFilter(record.target.platform))
    : records;
  return filtered.slice(0, limit);
}

export function resolveRecentSessions(
  sessions: readonly SessionRoute[],
  limit: number,
  platform?: PlatformName,
): SessionRoute[] {
  const ordered = [...sessions].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const filtered =
    platform === undefined
      ? ordered
      : ordered.filter((session) => session.platform === platform);
  return filtered.slice(0, limit);
}
