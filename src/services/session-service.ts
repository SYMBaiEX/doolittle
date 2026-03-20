import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import type { SessionSearchResult, StoredMessage } from "@/types";

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
