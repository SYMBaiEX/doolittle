import type {
  AdvancedLongTermMemory,
  AdvancedMemoryJsonValue,
  AdvancedSessionSummary,
} from "../service";
import type {
  AdvancedMemoryMetadata,
  LongTermMemoryRow,
  SessionSummaryRow,
} from "./types";

export function parseJsonValue<T>(raw: string | null): T | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function parseOptionalDate(raw: string | null): Date | undefined {
  if (!raw) {
    return undefined;
  }
  return new Date(raw);
}

export function parseRequiredDate(raw: string): Date {
  return new Date(raw);
}

export function mapLongTermMemoryRow(
  row: LongTermMemoryRow,
  options?: {
    lastAccessedAt?: string;
    accessCount?: number;
  },
): AdvancedLongTermMemory {
  return {
    id: row.id,
    agentId: row.agent_id,
    entityId: row.entity_id,
    category: row.category,
    content: row.content,
    metadata: parseJsonValue<AdvancedMemoryMetadata>(row.metadata),
    embedding: parseJsonValue<number[]>(row.embedding),
    confidence: row.confidence ?? undefined,
    source: row.source ?? undefined,
    createdAt: parseRequiredDate(row.created_at),
    updatedAt: parseRequiredDate(row.updated_at),
    lastAccessedAt: parseOptionalDate(
      options?.lastAccessedAt ?? row.last_accessed_at,
    ),
    accessCount: options?.accessCount ?? row.access_count ?? 0,
  };
}

export function mapSessionSummaryRow(
  row: SessionSummaryRow,
): AdvancedSessionSummary {
  return {
    id: row.id,
    agentId: row.agent_id,
    roomId: row.room_id,
    entityId: row.entity_id ?? undefined,
    summary: row.summary,
    messageCount: row.message_count,
    lastMessageOffset: row.last_message_offset,
    startTime: parseRequiredDate(row.start_time),
    endTime: parseRequiredDate(row.end_time),
    topics: parseJsonValue<string[]>(row.topics),
    metadata: parseJsonValue<Record<string, AdvancedMemoryJsonValue>>(
      row.metadata,
    ),
    embedding: parseJsonValue<number[]>(row.embedding),
    createdAt: parseRequiredDate(row.created_at),
    updatedAt: parseRequiredDate(row.updated_at),
  };
}
