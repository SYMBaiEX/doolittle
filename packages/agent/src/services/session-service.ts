import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  SessionSearchResult,
  SessionSummary,
  SessionUsageSummary,
  StoredMessage,
} from "@/types";

export type AdvancedMemoryJsonPrimitive = string | number | boolean | null;
export type AdvancedMemoryJsonValue =
  | AdvancedMemoryJsonPrimitive
  | AdvancedMemoryJsonValue[]
  | {
      [key: string]: AdvancedMemoryJsonValue;
    };

export type AdvancedLongTermMemoryCategory =
  | "episodic"
  | "semantic"
  | "procedural";

export interface AdvancedLongTermMemory {
  id: string;
  agentId: string;
  entityId: string;
  category: AdvancedLongTermMemoryCategory;
  content: string;
  metadata?: Record<string, AdvancedMemoryJsonValue>;
  embedding?: number[];
  confidence?: number;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  accessCount?: number;
  similarity?: number;
}

export interface AdvancedSessionSummary {
  id: string;
  agentId: string;
  roomId: string;
  entityId?: string;
  summary: string;
  messageCount: number;
  lastMessageOffset: number;
  startTime: Date;
  endTime: Date;
  topics?: string[];
  metadata?: Record<string, AdvancedMemoryJsonValue>;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

function parseJsonValue<T>(raw: string | null): T | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function parseOptionalDate(raw: string | null): Date | undefined {
  if (!raw) {
    return undefined;
  }
  return new Date(raw);
}

function parseRequiredDate(raw: string): Date {
  return new Date(raw);
}

export class SessionService {
  private readonly db: Database;
  private readonly events = new EventEmitter();

  constructor(baseDir: string) {
    const dbPath = join(baseDir, "state.db");
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.migrate();
  }

  storeMessage(message: StoredMessage): void {
    this.db
      .query(
        `
          INSERT INTO messages (id, session_id, room_id, entity_id, role, text, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `,
      )
      .run(
        message.id,
        message.sessionId,
        message.roomId,
        message.entityId,
        message.role,
        message.text,
        message.createdAt,
      );

    this.db
      .query(
        `
          INSERT INTO messages_fts (rowid, session_id, room_id, entity_id, role, text, created_at)
          VALUES (last_insert_rowid(), ?1, ?2, ?3, ?4, ?5, ?6)
        `,
      )
      .run(
        message.sessionId,
        message.roomId,
        message.entityId,
        message.role,
        message.text,
        message.createdAt,
      );

    this.events.emit("activity", {
      kind: "message",
      sessionId: message.sessionId,
      role: message.role,
      detail: `[${message.role}] ${message.text.slice(0, 160)}`,
    });
  }

  onActivity(
    listener: (event: {
      kind: "message";
      sessionId: string;
      role: StoredMessage["role"];
      detail: string;
    }) => void,
  ): () => void {
    this.events.on("activity", listener);
    return () => {
      this.events.off("activity", listener);
    };
  }

  search(query: string, limit: number): SessionSearchResult[] {
    return this.db
      .query(
        `
          SELECT session_id as sessionId, created_at as createdAt, role, text
          FROM messages_fts
          WHERE messages_fts MATCH ?1
          ORDER BY rank
          LIMIT ?2
        `,
      )
      .all(query.replaceAll('"', " "), limit) as SessionSearchResult[];
  }

  recent(limit: number): SessionSearchResult[] {
    return this.db
      .query(
        `
          SELECT session_id as sessionId, created_at as createdAt, role, text
          FROM messages
          ORDER BY created_at DESC
          LIMIT ?1
        `,
      )
      .all(limit) as SessionSearchResult[];
  }

  recentBySession(sessionId: string, limit: number): SessionSearchResult[] {
    return this.db
      .query(
        `
          SELECT session_id as sessionId, created_at as createdAt, role, text
          FROM messages
          WHERE session_id = ?1
          ORDER BY created_at DESC
          LIMIT ?2
        `,
      )
      .all(sessionId, limit) as SessionSearchResult[];
  }

  countBySessionRole(sessionId: string, role?: StoredMessage["role"]): number {
    const row = role
      ? ((this.db
          .query(
            `
              SELECT COUNT(*) as count
              FROM messages
              WHERE session_id = ?1 AND role = ?2
            `,
          )
          .get(sessionId, role) as { count: number } | null) ?? { count: 0 })
      : ((this.db
          .query(
            `
              SELECT COUNT(*) as count
              FROM messages
              WHERE session_id = ?1
            `,
          )
          .get(sessionId) as { count: number } | null) ?? { count: 0 });
    return row.count;
  }

  latest(limit: number): SessionSearchResult[] {
    return this.recent(limit);
  }

  summary(limit = 10): {
    totalSessions: number;
    recentSessionIds: string[];
  } {
    const total = this.db
      .query(
        `
          SELECT COUNT(DISTINCT session_id) as count
          FROM messages
        `,
      )
      .get() as { count: number };
    return {
      totalSessions: total.count,
      recentSessionIds: this.latest(limit).map((session) => session.sessionId),
    };
  }

  summarize(sessionId: string, limit = 12): SessionSummary {
    const rows = this.db
      .query(
        `
          SELECT session_id as sessionId, created_at as createdAt, role, text
          FROM messages
          WHERE session_id = ?1
          ORDER BY created_at ASC
          LIMIT ?2
        `,
      )
      .all(sessionId, limit) as SessionSearchResult[];

    const metadata = this.metadata(sessionId);

    if (!rows.length) {
      return {
        sessionId,
        title: metadata?.title,
        continuityKey: metadata?.continuityKey,
        messageCount: 0,
        participants: [],
        preview: [],
      };
    }

    const total = this.db
      .query(
        `
          SELECT COUNT(*) as count
          FROM messages
          WHERE session_id = ?1
        `,
      )
      .get(sessionId) as { count: number };

    return {
      sessionId,
      title: metadata?.title,
      continuityKey: metadata?.continuityKey,
      messageCount: total.count,
      startedAt: rows[0]?.createdAt,
      endedAt: rows.at(-1)?.createdAt,
      participants: Array.from(new Set(rows.map((row) => row.role))),
      preview: rows.map((row) => `[${row.role}] ${row.text.slice(0, 200)}`),
    };
  }

  listSessions(limit: number): SessionSummary[] {
    const rows = this.db
      .query(
        `
          SELECT
            session_id as sessionId,
            COUNT(*) as messageCount,
            MIN(created_at) as startedAt,
            MAX(created_at) as endedAt
          FROM messages
          GROUP BY session_id
          ORDER BY endedAt DESC
          LIMIT ?1
        `,
      )
      .all(limit) as Array<{
      sessionId: string;
      messageCount: number;
      startedAt?: string;
      endedAt?: string;
    }>;

    return rows.map((row) => {
      const summary = this.summarize(row.sessionId, 6);
      return {
        ...summary,
        messageCount: row.messageCount,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
      };
    });
  }

  listTitled(limit: number): SessionSummary[] {
    const rows = this.db
      .query(
        `
          SELECT session_id as sessionId
          FROM session_metadata
          WHERE title IS NOT NULL AND TRIM(title) != ''
          ORDER BY updated_at DESC
          LIMIT ?1
        `,
      )
      .all(limit) as Array<{ sessionId: string }>;
    return rows.map((row) => this.summarize(row.sessionId, 6));
  }

  resolveByTitle(query: string): SessionSummary | undefined {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    const exact = this.db
      .query(
        `
          SELECT session_id as sessionId
          FROM session_metadata
          WHERE LOWER(title) = ?1
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .get(normalized) as { sessionId: string } | null;
    if (exact?.sessionId) {
      return this.summarize(exact.sessionId, 6);
    }
    const fuzzy = this.db
      .query(
        `
          SELECT session_id as sessionId
          FROM session_metadata
          WHERE LOWER(title) LIKE ?1
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .get(`%${normalized}%`) as { sessionId: string } | null;
    return fuzzy?.sessionId ? this.summarize(fuzzy.sessionId, 6) : undefined;
  }

  usage(sessionId: string): SessionUsageSummary {
    const rows = this.db
      .query(
        `
          SELECT created_at as createdAt, role, text
          FROM messages
          WHERE session_id = ?1
          ORDER BY created_at ASC
        `,
      )
      .all(sessionId) as Array<{
      createdAt: string;
      role: "user" | "assistant" | "system";
      text: string;
    }>;

    const metadata = this.metadata(sessionId);
    const characterCount = rows.reduce((sum, row) => sum + row.text.length, 0);
    const counts = rows.reduce(
      (acc, row) => {
        acc[row.role] += 1;
        return acc;
      },
      {
        user: 0,
        assistant: 0,
        system: 0,
      },
    );

    return {
      sessionId,
      title: metadata?.title,
      continuityKey: metadata?.continuityKey,
      messageCount: rows.length,
      userMessages: counts.user,
      assistantMessages: counts.assistant,
      systemMessages: counts.system,
      startedAt: rows[0]?.createdAt,
      endedAt: rows.at(-1)?.createdAt,
      characterCount,
      estimatedTokens: Math.ceil(characterCount / 4),
      lastPreview: rows.at(-1)?.text.slice(0, 200),
    };
  }

  rename(sessionId: string, title: string): SessionSummary {
    const normalized = title.trim();
    if (!normalized) {
      throw new Error("Session title cannot be empty.");
    }
    const continuityKey = this.continuityKeyFor(sessionId);
    this.db
      .query(
        `
          INSERT INTO session_metadata (session_id, title, continuity_key, updated_at)
          VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT(session_id) DO UPDATE SET
            title = excluded.title,
            continuity_key = excluded.continuity_key,
            updated_at = excluded.updated_at
        `,
      )
      .run(sessionId, normalized, continuityKey, new Date().toISOString());
    return this.summarize(sessionId);
  }

  metadata(
    sessionId: string,
  ): { title?: string; continuityKey?: string } | undefined {
    const row = this.db
      .query(
        `
          SELECT title, continuity_key as continuityKey
          FROM session_metadata
          WHERE session_id = ?1
        `,
      )
      .get(sessionId) as {
      title?: string;
      continuityKey?: string;
    } | null;
    return row ?? undefined;
  }

  continuity(sessionId: string, limit = 20): SessionSummary[] {
    const continuityKey = this.continuityKeyFor(sessionId);
    const rows = this.db
      .query(
        `
          SELECT session_id as sessionId
          FROM session_metadata
          WHERE continuity_key = ?1
          ORDER BY updated_at DESC
          LIMIT ?2
        `,
      )
      .all(continuityKey, limit) as Array<{ sessionId: string }>;
    return rows.map((row) => this.summarize(row.sessionId, 6));
  }

  async storeLongTermMemory(
    memory: Omit<
      AdvancedLongTermMemory,
      "id" | "createdAt" | "updatedAt" | "accessCount"
    >,
  ): Promise<AdvancedLongTermMemory> {
    const stored: AdvancedLongTermMemory = {
      ...memory,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      accessCount: 0,
    };

    this.db
      .query(
        `
          INSERT INTO long_term_memories (
            id,
            agent_id,
            entity_id,
            category,
            content,
            metadata,
            embedding,
            confidence,
            source,
            created_at,
            updated_at,
            last_accessed_at,
            access_count
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        `,
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
        stored.accessCount ?? 0,
      );

    return stored;
  }

  async getLongTermMemories(
    agentId: string,
    entityId: string,
    opts?: {
      category?: AdvancedLongTermMemoryCategory;
      limit?: number;
    },
  ): Promise<AdvancedLongTermMemory[]> {
    const limit = Math.max(1, opts?.limit ?? 10);
    const rows = (
      opts?.category
        ? this.db
            .query(
              `
                SELECT *
                FROM long_term_memories
                WHERE agent_id = ?1 AND entity_id = ?2 AND category = ?3
                ORDER BY created_at DESC
                LIMIT ?4
              `,
            )
            .all(agentId, entityId, opts.category, limit)
        : this.db
            .query(
              `
                SELECT *
                FROM long_term_memories
                WHERE agent_id = ?1 AND entity_id = ?2
                ORDER BY created_at DESC
                LIMIT ?3
              `,
            )
            .all(agentId, entityId, limit)
    ) as Array<{
      id: string;
      agent_id: string;
      entity_id: string;
      category: AdvancedLongTermMemoryCategory;
      content: string;
      metadata: string | null;
      embedding: string | null;
      confidence: number | null;
      source: string | null;
      created_at: string;
      updated_at: string;
      last_accessed_at: string | null;
      access_count: number | null;
    }>;

    const now = new Date().toISOString();
    for (const row of rows) {
      this.db
        .query(
          `
            UPDATE long_term_memories
            SET last_accessed_at = ?1,
                access_count = COALESCE(access_count, 0) + 1
            WHERE id = ?2
          `,
        )
        .run(now, row.id);
    }

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      entityId: row.entity_id,
      category: row.category,
      content: row.content,
      metadata: parseJsonValue<Record<string, AdvancedMemoryJsonValue>>(
        row.metadata,
      ),
      embedding: parseJsonValue<number[]>(row.embedding),
      confidence: row.confidence ?? undefined,
      source: row.source ?? undefined,
      createdAt: parseRequiredDate(row.created_at),
      updatedAt: parseRequiredDate(row.updated_at),
      lastAccessedAt: parseOptionalDate(now),
      accessCount: (row.access_count ?? 0) + 1,
    }));
  }

  async updateLongTermMemory(
    id: string,
    agentId: string,
    entityId: string,
    updates: Partial<
      Omit<AdvancedLongTermMemory, "id" | "agentId" | "entityId" | "createdAt">
    >,
  ): Promise<void> {
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];
    const push = (column: string, value: string | number | null) => {
      assignments.push(`${column} = ?${values.length + 1}`);
      values.push(value);
    };

    if (updates.category !== undefined) {
      push("category", updates.category);
    }
    if (updates.content !== undefined) {
      push("content", updates.content);
    }
    if (updates.metadata !== undefined) {
      push("metadata", JSON.stringify(updates.metadata));
    }
    if (updates.embedding !== undefined) {
      push("embedding", JSON.stringify(updates.embedding));
    }
    if (updates.confidence !== undefined) {
      push("confidence", updates.confidence ?? null);
    }
    if (updates.source !== undefined) {
      push("source", updates.source ?? null);
    }
    if (updates.lastAccessedAt !== undefined) {
      push(
        "last_accessed_at",
        updates.lastAccessedAt ? updates.lastAccessedAt.toISOString() : null,
      );
    }
    if (updates.accessCount !== undefined) {
      push("access_count", updates.accessCount ?? 0);
    }

    push("updated_at", new Date().toISOString());
    values.push(id, agentId, entityId);

    this.db
      .query(
        `
          UPDATE long_term_memories
          SET ${assignments.join(", ")}
          WHERE id = ?${values.length - 2}
            AND agent_id = ?${values.length - 1}
            AND entity_id = ?${values.length}
        `,
      )
      .run(...values);
  }

  async deleteLongTermMemory(
    id: string,
    agentId: string,
    entityId: string,
  ): Promise<void> {
    this.db
      .query(
        `
          DELETE FROM long_term_memories
          WHERE id = ?1 AND agent_id = ?2 AND entity_id = ?3
        `,
      )
      .run(id, agentId, entityId);
  }

  async storeSessionSummary(
    summary: Omit<AdvancedSessionSummary, "id" | "createdAt" | "updatedAt">,
  ): Promise<AdvancedSessionSummary> {
    const stored: AdvancedSessionSummary = {
      ...summary,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.db
      .query(
        `
          INSERT INTO session_summaries (
            id,
            agent_id,
            room_id,
            entity_id,
            summary,
            message_count,
            last_message_offset,
            start_time,
            end_time,
            topics,
            metadata,
            embedding,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        `,
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
    agentId: string,
    roomId: string,
  ): Promise<AdvancedSessionSummary | null> {
    const row = this.db
      .query(
        `
          SELECT *
          FROM session_summaries
          WHERE agent_id = ?1 AND room_id = ?2
          ORDER BY end_time DESC, updated_at DESC
          LIMIT 1
        `,
      )
      .get(agentId, roomId) as {
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
    } | null;

    if (!row) {
      return null;
    }

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

  async updateSessionSummary(
    id: string,
    agentId: string,
    roomId: string,
    updates: Partial<
      Omit<
        AdvancedSessionSummary,
        "id" | "agentId" | "roomId" | "createdAt" | "updatedAt"
      >
    >,
  ): Promise<void> {
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];
    const push = (column: string, value: string | number | null) => {
      assignments.push(`${column} = ?${values.length + 1}`);
      values.push(value);
    };

    if (updates.entityId !== undefined) {
      push("entity_id", updates.entityId ?? null);
    }
    if (updates.summary !== undefined) {
      push("summary", updates.summary);
    }
    if (updates.messageCount !== undefined) {
      push("message_count", updates.messageCount);
    }
    if (updates.lastMessageOffset !== undefined) {
      push("last_message_offset", updates.lastMessageOffset);
    }
    if (updates.startTime !== undefined) {
      push("start_time", updates.startTime.toISOString());
    }
    if (updates.endTime !== undefined) {
      push("end_time", updates.endTime.toISOString());
    }
    if (updates.topics !== undefined) {
      push("topics", JSON.stringify(updates.topics));
    }
    if (updates.metadata !== undefined) {
      push("metadata", JSON.stringify(updates.metadata));
    }
    if (updates.embedding !== undefined) {
      push("embedding", JSON.stringify(updates.embedding));
    }

    push("updated_at", new Date().toISOString());
    values.push(id, agentId, roomId);

    this.db
      .query(
        `
          UPDATE session_summaries
          SET ${assignments.join(", ")}
          WHERE id = ?${values.length - 2}
            AND agent_id = ?${values.length - 1}
            AND room_id = ?${values.length}
        `,
      )
      .run(...values);
  }

  async getSessionSummaries(
    agentId: string,
    roomId: string,
    limit = 5,
  ): Promise<AdvancedSessionSummary[]> {
    const rows = this.db
      .query(
        `
          SELECT *
          FROM session_summaries
          WHERE agent_id = ?1 AND room_id = ?2
          ORDER BY end_time DESC, updated_at DESC
          LIMIT ?3
        `,
      )
      .all(agentId, roomId, Math.max(1, limit)) as Array<{
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
    }>;

    return rows.map((row) => ({
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
    }));
  }

  private continuityKeyFor(sessionId: string): string {
    return sessionId.split(":").slice(0, 2).join(":") || sessionId;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        session_id,
        room_id,
        entity_id,
        role,
        text,
        created_at
      );

      CREATE TABLE IF NOT EXISTS session_metadata (
        session_id TEXT PRIMARY KEY,
        title TEXT,
        continuity_key TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session_created_at
        ON messages (session_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_messages_session_role_created_at
        ON messages (session_id, role, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_messages_room_created_at
        ON messages (room_id, created_at DESC);

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
}
