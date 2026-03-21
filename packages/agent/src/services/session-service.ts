import { Database } from "bun:sqlite";
import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  SessionSearchResult,
  SessionSummary,
  SessionUsageSummary,
  StoredMessage,
} from "@/types";

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

  latest(limit: number): SessionSearchResult[] {
    return this.recent(limit);
  }

  summary(limit = 10): {
    totalSessions: number;
    recentSessionIds: string[];
  } {
    return {
      totalSessions: this.listSessions(1000).length,
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
    `);
  }
}
