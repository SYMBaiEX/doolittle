import type { Database } from "bun:sqlite";
import {
  ContextCompressionService,
  DEFAULT_CONTEXT_WINDOW,
} from "@/services/context-compression";
import type {
  SessionUsageOptions,
  SessionUsageSummary,
  StoredMessage,
} from "@/types";
import type { SessionMetadataResolver } from "./types";

const DEFAULT_USAGE_SAMPLE_LIMIT = 500;
const MAX_USAGE_SAMPLE_LIMIT = 2_000;
const DEFAULT_COMPRESSION_THRESHOLD = 0.85;

interface UsageAggregateRow {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  systemMessages: number;
  startedAt: string | null;
  endedAt: string | null;
  characterCount: number;
  lastPreview: string | null;
}

function normalizeSampleLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    return DEFAULT_USAGE_SAMPLE_LIMIT;
  }
  return Math.min(value ?? DEFAULT_USAGE_SAMPLE_LIMIT, MAX_USAGE_SAMPLE_LIMIT);
}

function normalizeThreshold(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_COMPRESSION_THRESHOLD;
  }
  return Math.min(Math.max(value ?? DEFAULT_COMPRESSION_THRESHOLD, 0), 1);
}

export function resolveSessionUsage(
  db: Database,
  metadataResolver: SessionMetadataResolver,
  sessionId: string,
  options: SessionUsageOptions = {},
): SessionUsageSummary {
  const aggregate = db
    .query(
      `
        SELECT
          COUNT(*) as totalMessages,
          COALESCE(SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END), 0)
            as userMessages,
          COALESCE(SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END), 0)
            as assistantMessages,
          COALESCE(SUM(CASE WHEN role = 'system' THEN 1 ELSE 0 END), 0)
            as systemMessages,
          MIN(created_at) as startedAt,
          MAX(created_at) as endedAt,
          COALESCE(SUM(LENGTH(text)), 0) as characterCount,
          (
            SELECT text
            FROM messages latest
            WHERE latest.session_id = ?1
            ORDER BY latest.created_at DESC, latest.rowid DESC
            LIMIT 1
          ) as lastPreview
        FROM messages
        WHERE session_id = ?1
      `,
    )
    .get(sessionId) as UsageAggregateRow;

  const sampleLimit = normalizeSampleLimit(options.sampleLimit);
  const sampled = db
    .query(
      `
        SELECT id, session_id as sessionId, room_id as roomId,
          entity_id as entityId, role, text, created_at as createdAt
        FROM (
          SELECT rowid, id, session_id, room_id, entity_id, role, text, created_at
          FROM messages
          WHERE session_id = ?1
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?2
        )
        ORDER BY createdAt ASC, rowid ASC
      `,
    )
    .all(sessionId, sampleLimit) as StoredMessage[];

  const metadata = metadataResolver.metadata(sessionId);
  const provider = options.provider?.trim() || "unknown";
  const model = options.model?.trim() || "unknown";
  const contextWindowTokens =
    model === "unknown"
      ? DEFAULT_CONTEXT_WINDOW
      : ContextCompressionService.resolveContextWindow(model);
  const context = new ContextCompressionService({
    contextWindowTokens,
    threshold: normalizeThreshold(options.threshold),
  }).measure(sampled);
  const percent = Math.min(
    100,
    Math.max(0, Math.round(context.usageFraction * 100)),
  );

  return {
    sessionId,
    title: metadata?.title,
    continuityKey: metadata?.continuityKey,
    messageCount: aggregate.totalMessages,
    userMessages: aggregate.userMessages,
    assistantMessages: aggregate.assistantMessages,
    systemMessages: aggregate.systemMessages,
    startedAt: aggregate.startedAt ?? undefined,
    endedAt: aggregate.endedAt ?? undefined,
    characterCount: aggregate.characterCount,
    estimatedTokens: Math.ceil(aggregate.characterCount / 4),
    context: {
      estimatedTokens: context.estimatedTokens,
      contextWindowTokens: context.contextWindowTokens,
      usageFraction: context.usageFraction,
      percent,
      overThreshold: context.overThreshold,
      estimated: true,
      sampledMessages: sampled.length,
      totalMessages: aggregate.totalMessages,
      truncated: aggregate.totalMessages > sampled.length,
      provider,
      model,
    },
    lastPreview: aggregate.lastPreview?.slice(0, 200),
  };
}
