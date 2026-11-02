import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  JsonValue,
  LongTermMemory,
  LongTermMemoryCategory,
  UUID,
} from "@elizaos/core";
import {
  NodeSessionDatabase,
  type SessionDatabase,
} from "../../../../services/session/database";

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
}
