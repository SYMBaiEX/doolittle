import type {
  GatewayMessageLike,
  GatewayTraceLike,
} from "../../../types/trajectory";
import { writeTrajectoryBundleRecords } from "./bundle-writer";
import type {
  TrajectoryBundleStorageHost,
  TrajectoryGatewayIngestInput,
} from "./types";

export function ingestTrajectoryGatewayHistory(
  host: TrajectoryBundleStorageHost,
  input: TrajectoryGatewayIngestInput,
): ReturnType<typeof writeTrajectoryBundleRecords> & {
  traceCount: number;
  inboxCount: number;
  outboxCount: number;
} {
  const records = [
    ...input.traces.map((entry) => {
      const sessionId = deriveSessionId(entry.platform, entry);
      const text = `[gateway:${entry.platform}:${entry.kind}] ${entry.detail}`;
      return {
        sessionId,
        createdAt: entry.at,
        role: "system" as const,
        text,
      };
    }),
    ...input.inbox.map((entry) => {
      const sessionId = deriveSessionId(entry.platform, entry);
      const text =
        entry.text ??
        entry.detail ??
        `[gateway:${entry.platform}:inbox] ${entry.status ?? "received"}`;
      return { sessionId, createdAt: entry.at, role: "user" as const, text };
    }),
    ...input.outbox.map((entry) => {
      const sessionId = deriveSessionId(entry.platform, entry);
      const text =
        entry.text ??
        entry.detail ??
        `[gateway:${entry.platform}:outbox] ${entry.status ?? "sent"}`;
      return {
        sessionId,
        createdAt: entry.at,
        role: "assistant" as const,
        text,
      };
    }),
  ];
  records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  const bundle = writeTrajectoryBundleRecords(host, records, {
    label: input.label ?? "gateway-history",
    purpose: input.purpose ?? "gateway history ingest",
    mode: "research",
    limit: records.length,
    sessionId: undefined,
    role: undefined,
    tags: input.tags ?? ["gateway", "history"],
    notes: input.notes,
  });

  return {
    ...bundle,
    traceCount: input.traces.length,
    inboxCount: input.inbox.length,
    outboxCount: input.outbox.length,
  };
}

function deriveSessionId(
  platform: string,
  entry: GatewayTraceLike | GatewayMessageLike,
): string {
  if (entry.sessionId) {
    return entry.sessionId;
  }
  return `${platform}:${entry.roomId ?? entry.userId ?? "unknown"}`;
}
