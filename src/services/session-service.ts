import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import type { SessionSearchResult, SessionSummary, StoredMessage } from "@/types";

export class SessionService {
  private readonly db: Database;

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

    if (!rows.length) {
      return {
        sessionId,
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
    `);
  }
}
