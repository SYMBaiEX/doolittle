import type { ActionFeedback } from "./lib";
import { asNumber, asRecord, asString } from "./value-guards";

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
  retryable: boolean;
  retryCompleted: boolean;
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

export type GatewayAction =
  | "approve"
  | "deny"
  | "revoke"
  | "replay"
  | "retry-delivery";

export function gatewayResourcePolicy(
  active: boolean,
  pairingOpen: boolean,
  routesOpen: boolean,
) {
  return {
    primary: active,
    pairing: active && pairingOpen,
    routes: active && routesOpen,
  };
}

export function gatewayActionFeedback(
  action: GatewayAction,
  error?: string,
): ActionFeedback {
  if (error) {
    return {
      message: `${action === "replay" ? "Replay" : action === "retry-delivery" ? "Delivery retry" : "Pairing update"} could not be completed: ${error}`,
      tone: "bad",
    };
  }
  switch (action) {
    case "approve":
      return {
        message:
          "Pairing approved. The sender is now allowed by Eliza PairingService.",
        tone: "good",
      };
    case "deny":
      return {
        message:
          "Pairing request denied and removed from Eliza PairingService.",
        tone: "good",
      };
    case "revoke":
      return {
        message: "Approved sender revoked from Eliza PairingService.",
        tone: "good",
      };
    case "replay":
      return {
        message:
          "Replay submitted. Doolittle is reprocessing the recorded inbound preview on its original thread route.",
        tone: "good",
      };
    case "retry-delivery":
      return {
        message:
          "Delivery retried from the stored outbound payload. The agent and its tools were not run again.",
        tone: "good",
      };
  }
}

export function buildGatewayTimeline(
  inbox: unknown[],
  outbox: unknown[],
): GatewayTimelineItem[] {
  const completedRetryIds = new Set(
    outbox.flatMap((value) => {
      const record = asRecord(value);
      const status = asString(record.status).toLowerCase();
      const retryOfRecordId = asString(record.retryOfRecordId);
      return retryOfRecordId && ["sent", "fallback", "edited"].includes(status)
        ? [retryOfRecordId]
        : [];
    }),
  );
  const records = [
    ...inbox.map((value) => ({ direction: "inbox" as const, value })),
    ...outbox.map((value) => ({ direction: "outbox" as const, value })),
  ];
  return records
    .map(({ direction, value }, index) => {
      const record = asRecord(value);
      const at = asString(record.at);
      const recordId = asString(record.recordId, `${direction}-${index}`);
      const status = asString(record.status, "recorded");
      const retryCompleted =
        direction === "outbox" && completedRetryIds.has(recordId);
      return {
        id: recordId,
        direction,
        at,
        platform: asString(record.platform, "unknown"),
        status,
        sessionId: asString(record.sessionId),
        roomId: asString(record.roomId),
        threadId: asString(record.threadId),
        author: asString(record.authorName),
        preview: asString(record.textPreview, "No message preview recorded."),
        attachmentCount: asNumber(record.attachmentCount),
        retryable:
          direction === "outbox" &&
          status.toLowerCase() === "rejected" &&
          !retryCompleted,
        retryCompleted,
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
