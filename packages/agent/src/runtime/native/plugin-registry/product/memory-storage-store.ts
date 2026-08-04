import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  JsonValue,
  LongTermMemory,
  LongTermMemoryCategory,
  SessionSummary,
  UUID,
} from "@elizaos/core";
import {
  NodeSessionDatabase,
  type SessionDatabase,
} from "@/services/session/database";

interface LongTermMemoryRow {
  id: string;
  agent_id: string;
  entity_id: string;
  category: LongTermMemoryCategory;
  content: string;
  metadata: string | null;
  embedding: string | null;
  confidence: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  access_count: number | null;
}

interface SessionSummaryRow {
  id: string;
  agent_id: string;
  room_id: string;
  entity_id: string | null;
  summary: string;
  message_count: number;
  last_message_offset: number;
  start_time: string;
  end_time: string;
  topics: string | null;
  metadata: string | null;
  embedding: string | null;
  created_at: string;
  updated_at: string;
}

interface AssignmentBuilder {
  push(column: string, value: string | number | null): void;
  readonly assignments: string[];
  readonly values: (string | number | null)[];
}

function assignments(): AssignmentBuilder {
  const clauses: string[] = [];
  const values: (string | number | null)[] = [];
  return {
    push(column, value) {
      clauses.push(`${column} = ?${values.length + 1}`);
      values.push(value);
    },
    get assignments() {
      return clauses;
    },
    get values() {
      return values;
    },
  };
}

function parseJson<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function mapLongTermMemory(
  row: LongTermMemoryRow,
  touchedAt?: string,
): LongTermMemory {
  return {
    id: row.id as UUID,
    agentId: row.agent_id as UUID,
    entityId: row.entity_id as UUID,
    category: row.category,
    content: row.content,
    metadata: parseJson<Record<string, JsonValue>>(row.metadata),
    embedding: parseJson<number[]>(row.embedding),
    confidence: row.confidence ?? undefined,
    source: row.source ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastAccessedAt: touchedAt
      ? new Date(touchedAt)
      : row.last_accessed_at
        ? new Date(row.last_accessed_at)
        : undefined,
    accessCount: (row.access_count ?? 0) + (touchedAt ? 1 : 0),
  };
}

function mapSessionSummary(row: SessionSummaryRow): SessionSummary {
  return {
    id: row.id as UUID,
    agentId: row.agent_id as UUID,
    roomId: row.room_id as UUID,
    entityId: row.entity_id ? (row.entity_id as UUID) : undefined,
    summary: row.summary,
    messageCount: row.message_count,
    lastMessageOffset: row.last_message_offset,
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    topics: parseJson<string[]>(row.topics),
    metadata: parseJson<Record<string, JsonValue>>(row.metadata),
    embedding: parseJson<number[]>(row.embedding),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function migrate(db: SessionDatabase): void {
  db.exec(`
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS long_term_memories (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      embedding TEXT,
      confidence REAL,
      source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT,
      access_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_long_term_memories_agent_entity
      ON long_term_memories (agent_id, entity_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_long_term_memories_agent_entity_category
      ON long_term_memories (agent_id, entity_id, category, created_at DESC);

    CREATE TABLE IF NOT EXISTS session_summaries (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      message_count INTEGER NOT NULL,
      last_message_offset INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      topics TEXT,
      metadata TEXT,
      embedding TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_summaries_agent_room
      ON session_summaries (agent_id, room_id, end_time DESC, updated_at DESC);
  `);
}

/**
 * SQLite implementation of Eliza's MemoryStorageProvider contract.
 *
 * The Eliza runtime service owns this store's lifecycle. It intentionally
 * shares the existing state.db file only to preserve advanced memories written
 * by earlier Doolittle releases; SessionService no longer exposes or owns these
 * tables.
 */
export class ElizaMemoryStorageStore {
  private readonly db: SessionDatabase;

  constructor(dataDir: string) {
    const path = join(dataDir, "state.db");
    mkdirSync(dirname(path), { recursive: true });
    this.db = new NodeSessionDatabase(path);
    migrate(this.db);
  }

  close(): void {
    this.db.close();
  }

  async storeLongTermMemory(
    memory: Omit<
      LongTermMemory,
      "id" | "createdAt" | "updatedAt" | "accessCount"
    >,
  ): Promise<LongTermMemory> {
    const now = new Date();
    const stored: LongTermMemory = {
      ...memory,
      id: randomUUID() as UUID,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
    };
    this.db
      .query(
        `INSERT INTO long_term_memories (
          id, agent_id, entity_id, category, content, metadata, embedding,
          confidence, source, created_at, updated_at, last_accessed_at,
          access_count
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      )
      .run(
        stored.id,
        stored.agentId,
        stored.entityId,
        stored.category,
        stored.content,
        stored.metadata ? JSON.stringify(stored.metadata) : null,
        stored.embedding ? JSON.stringify(stored.embedding) : null,
        stored.confidence ?? null,
        stored.source ?? null,
        stored.createdAt.toISOString(),
        stored.updatedAt.toISOString(),
        stored.lastAccessedAt?.toISOString() ?? null,
        stored.accessCount,
      );
    return stored;
  }

  async getLongTermMemories(
    agentId: UUID,
    entityId: UUID,
    opts?: { category?: LongTermMemoryCategory; limit?: number },
  ): Promise<LongTermMemory[]> {
    const limit = Math.max(1, opts?.limit ?? 10);
    const rows = (
      opts?.category
        ? this.db
            .query(
              `SELECT * FROM long_term_memories
               WHERE agent_id = ?1 AND entity_id = ?2 AND category = ?3
               ORDER BY created_at DESC LIMIT ?4`,
            )
            .all(agentId, entityId, opts.category, limit)
        : this.db
            .query(
              `SELECT * FROM long_term_memories
               WHERE agent_id = ?1 AND entity_id = ?2
               ORDER BY created_at DESC LIMIT ?3`,
            )
            .all(agentId, entityId, limit)
    ) as LongTermMemoryRow[];
    const touchedAt = new Date().toISOString();
    const touch = this.db.query(
      `UPDATE long_term_memories
       SET last_accessed_at = ?1, access_count = COALESCE(access_count, 0) + 1
       WHERE id = ?2`,
    );
    for (const row of rows) touch.run(touchedAt, row.id);
    return rows.map((row) => mapLongTermMemory(row, touchedAt));
  }

  async updateLongTermMemory(
    id: UUID,
    agentId: UUID,
    entityId: UUID,
    updates: Partial<
      Omit<LongTermMemory, "id" | "agentId" | "entityId" | "createdAt">
    >,
  ): Promise<void> {
    const patch = assignments();
    if (updates.category !== undefined)
      patch.push("category", updates.category);
    if (updates.content !== undefined) patch.push("content", updates.content);
    if (updates.metadata !== undefined)
      patch.push("metadata", JSON.stringify(updates.metadata));
    if (updates.embedding !== undefined)
      patch.push("embedding", JSON.stringify(updates.embedding));
    if (updates.confidence !== undefined)
      patch.push("confidence", updates.confidence ?? null);
    if (updates.source !== undefined)
      patch.push("source", updates.source ?? null);
    if (updates.lastAccessedAt !== undefined)
      patch.push(
        "last_accessed_at",
        updates.lastAccessedAt?.toISOString() ?? null,
      );
    if (updates.accessCount !== undefined)
      patch.push("access_count", updates.accessCount);
    patch.push("updated_at", new Date().toISOString());
    const values = [...patch.values, id, agentId, entityId];
    const count = values.length;
    this.db
      .query(
        `UPDATE long_term_memories SET ${patch.assignments.join(", ")}
         WHERE id = ?${count - 2}
           AND agent_id = ?${count - 1}
           AND entity_id = ?${count}`,
      )
      .run(...values);
  }

  async deleteLongTermMemory(
    id: UUID,
    agentId: UUID,
    entityId: UUID,
  ): Promise<void> {
    this.db
      .query(
        `DELETE FROM long_term_memories
         WHERE id = ?1 AND agent_id = ?2 AND entity_id = ?3`,
      )
      .run(id, agentId, entityId);
  }

  async storeSessionSummary(
    summary: Omit<SessionSummary, "id" | "createdAt" | "updatedAt">,
  ): Promise<SessionSummary> {
    const now = new Date();
    const stored: SessionSummary = {
      ...summary,
      id: randomUUID() as UUID,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .query(
        `INSERT INTO session_summaries (
          id, agent_id, room_id, entity_id, summary, message_count,
          last_message_offset, start_time, end_time, topics, metadata,
          embedding, created_at, updated_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
        )`,
      )
      .run(
        stored.id,
        stored.agentId,
        stored.roomId,
        stored.entityId ?? null,
        stored.summary,
        stored.messageCount,
        stored.lastMessageOffset,
        stored.startTime.toISOString(),
        stored.endTime.toISOString(),
        stored.topics ? JSON.stringify(stored.topics) : null,
        stored.metadata ? JSON.stringify(stored.metadata) : null,
        stored.embedding ? JSON.stringify(stored.embedding) : null,
        stored.createdAt.toISOString(),
        stored.updatedAt.toISOString(),
      );
    return stored;
  }

  async getCurrentSessionSummary(
    agentId: UUID,
    roomId: UUID,
  ): Promise<SessionSummary | null> {
    const row = this.db
      .query(
        `SELECT * FROM session_summaries
         WHERE agent_id = ?1 AND room_id = ?2
         ORDER BY end_time DESC, updated_at DESC LIMIT 1`,
      )
      .get(agentId, roomId) as SessionSummaryRow | null;
    return row ? mapSessionSummary(row) : null;
  }

  async updateSessionSummary(
    id: UUID,
    agentId: UUID,
    roomId: UUID,
    updates: Partial<
      Omit<
        SessionSummary,
        "id" | "agentId" | "roomId" | "createdAt" | "updatedAt"
      >
    >,
  ): Promise<void> {
    const patch = assignments();
    if (updates.entityId !== undefined)
      patch.push("entity_id", updates.entityId ?? null);
    if (updates.summary !== undefined) patch.push("summary", updates.summary);
    if (updates.messageCount !== undefined)
      patch.push("message_count", updates.messageCount);
    if (updates.lastMessageOffset !== undefined)
      patch.push("last_message_offset", updates.lastMessageOffset);
    if (updates.startTime !== undefined)
      patch.push("start_time", updates.startTime.toISOString());
    if (updates.endTime !== undefined)
      patch.push("end_time", updates.endTime.toISOString());
    if (updates.topics !== undefined)
      patch.push("topics", JSON.stringify(updates.topics));
    if (updates.metadata !== undefined)
      patch.push("metadata", JSON.stringify(updates.metadata));
    if (updates.embedding !== undefined)
      patch.push("embedding", JSON.stringify(updates.embedding));
    patch.push("updated_at", new Date().toISOString());
    const values = [...patch.values, id, agentId, roomId];
    const count = values.length;
    this.db
      .query(
        `UPDATE session_summaries SET ${patch.assignments.join(", ")}
         WHERE id = ?${count - 2}
           AND agent_id = ?${count - 1}
           AND room_id = ?${count}`,
      )
      .run(...values);
  }

  async getSessionSummaries(
    agentId: UUID,
    roomId: UUID,
    limit = 5,
  ): Promise<SessionSummary[]> {
    const rows = this.db
      .query(
        `SELECT * FROM session_summaries
         WHERE agent_id = ?1 AND room_id = ?2
         ORDER BY end_time DESC, updated_at DESC LIMIT ?3`,
      )
      .all(agentId, roomId, Math.max(1, limit)) as SessionSummaryRow[];
    return rows.map(mapSessionSummary);
  }
}
