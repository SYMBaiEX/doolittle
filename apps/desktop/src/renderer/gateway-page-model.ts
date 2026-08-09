import { asRecord } from "./value-guards";

export type GatewayDirection = "inbox" | "outbox";

export interface GatewayTimelineItem {
  id: string;
  direction: GatewayDirection;
  at: string;
  platform: string;
  status: string;
  sessionId: string;
  roomId: string;
  threadId: string;
  author: string;
  preview: string;
  attachmentCount: number;
}

export interface GatewayPairingRequest {
  id: string;
  platform: string;
  userId: string;
  code: string;
  createdAt: string;
}

export interface GatewayApprovedSender {
  id: string;
  platform: string;
  userId: string;
  approvedAt: string;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildGatewayTimeline(
  inbox: unknown[],
  outbox: unknown[],
): GatewayTimelineItem[] {
  const records = [
    ...inbox.map((value) => ({ direction: "inbox" as const, value })),
    ...outbox.map((value) => ({ direction: "outbox" as const, value })),
  ];
  return records
    .map(({ direction, value }, index) => {
      const record = asRecord(value);
      const at = asString(record.at);
      const recordId = asString(record.recordId, `${direction}-${index}`);
      return {
        id: recordId,
        direction,
        at,
        platform: asString(record.platform, "unknown"),
        status: asString(record.status, "recorded"),
        sessionId: asString(record.sessionId),
        roomId: asString(record.roomId),
        threadId: asString(record.threadId),
        author: asString(record.authorName),
        preview: asString(record.textPreview, "No message preview recorded."),
        attachmentCount: asNumber(record.attachmentCount),
      };
    })
    .sort((left, right) => right.at.localeCompare(left.at));
}

export function filterGatewayTimeline(
  entries: GatewayTimelineItem[],
  filter: {
    direction: "all" | GatewayDirection;
    platform: string;
    query: string;
  },
): GatewayTimelineItem[] {
  const query = filter.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.direction !== "all" && entry.direction !== filter.direction) {
      return false;
    }
    if (filter.platform !== "all" && entry.platform !== filter.platform) {
      return false;
    }
    if (!query) return true;
    return [
      entry.id,
      entry.platform,
      entry.status,
      entry.sessionId,
      entry.roomId,
      entry.threadId,
      entry.author,
      entry.preview,
    ].some((value) => value.toLowerCase().includes(query));
  });
}

export function gatewayStatusTone(
  status: string,
): "good" | "warn" | "bad" | "neutral" {
  const normalized = status.toLowerCase();
  if (["sent", "accepted", "received", "edited"].includes(normalized)) {
    return "good";
  }
  if (["rejected", "failed", "error"].includes(normalized)) return "bad";
  if (["fallback", "pending", "replaying"].includes(normalized)) return "warn";
  return "neutral";
}

export function pairingRequests(value: unknown): GatewayPairingRequest[] {
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    const record = asRecord(item);
    const id = asString(record.id);
    const platform = asString(record.platform);
    const userId = asString(record.userId);
    const code = asString(record.code);
    if (!id || !platform || !userId || !code) return [];
    return [
      { id, platform, userId, code, createdAt: asString(record.createdAt) },
    ];
  });
}

export function approvedPairingSenders(
  value: unknown,
): GatewayApprovedSender[] {
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    const record = asRecord(item);
    const id = asString(record.id);
    const platform = asString(record.platform);
    const userId = asString(record.userId);
    if (!id || !platform || !userId) return [];
    return [{ id, platform, userId, approvedAt: asString(record.approvedAt) }];
  });
}
