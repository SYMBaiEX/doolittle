import type { Database } from "bun:sqlite";
import type { EventEmitter } from "node:events";
import type {
  SessionExchangeMutationResult,
  SessionSearchResult,
  StoredMessage,
} from "@/types";

export interface SessionMessageActivityEvent {
  kind: "message";
  sessionId: string;
  role: StoredMessage["role"];
  detail: string;
}

export class SessionMessageStore {
  constructor(
    private readonly db: Database,
    private readonly events: Pick<EventEmitter, "emit" | "on" | "off">,
  ) {}

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
    } satisfies SessionMessageActivityEvent);
  }

  replaceSessionMessages(sessionId: string, messages: StoredMessage[]): void {
    const rows = this.db
      .query(
        `
          SELECT rowid
          FROM messages
          WHERE session_id = ?1
        `,
      )
      .all(sessionId) as Array<{ rowid: number }>;

    if (rows.length) {
      const placeholders = rows.map(() => "?").join(", ");
      const rowIds = rows.map((row) => row.rowid);
      this.db
        .query(`DELETE FROM messages_fts WHERE rowid IN (${placeholders})`)
        .run(...rowIds);
      this.db
        .query(`DELETE FROM messages WHERE rowid IN (${placeholders})`)
        .run(...rowIds);
    }

    for (const message of messages) {
      this.storeMessage({
        ...message,
        sessionId,
      });
    }
  }

  onActivity(
    listener: (event: SessionMessageActivityEvent) => void,
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

  messagesBySession(sessionId: string, limit: number): StoredMessage[] {
    return this.db
      .query(
        `
          SELECT id, session_id as sessionId, room_id as roomId,
            entity_id as entityId, role, text, created_at as createdAt
          FROM messages
          WHERE session_id = ?1
          ORDER BY created_at ASC
          LIMIT ?2
        `,
      )
      .all(sessionId, limit) as StoredMessage[];
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

  deleteLatestExchange(
    sessionId: string,
    options?: { skipSlashCommands?: boolean },
  ): SessionExchangeMutationResult {
    const user = this.latestUserMessage(sessionId, options);
    if (!user) {
      return {
        sessionId,
        assistantMessages: [],
        deletedMessages: 0,
      };
    }

    const nextUser = this.db
      .query(
        `
          SELECT MIN(rowid) as rowid
          FROM messages
          WHERE session_id = ?1 AND role = 'user' AND rowid > ?2
        `,
      )
      .get(sessionId, user.rowid) as { rowid: number | null } | null;
    const nextUserRowId = nextUser?.rowid ?? null;
    const rows = this.db
      .query(
        `
          SELECT rowid, id, session_id as sessionId, room_id as roomId,
            entity_id as entityId, role, text, created_at as createdAt
          FROM messages
          WHERE session_id = ?1
            AND (
              rowid = ?2
              OR (
                role = 'assistant'
                AND rowid > ?2
                AND (?3 IS NULL OR rowid < ?3)
              )
            )
          ORDER BY rowid ASC
        `,
      )
      .all(sessionId, user.rowid, nextUserRowId) as StoredMessageRow[];

    const rowIds = rows.map((row) => row.rowid);
    if (rowIds.length) {
      const placeholders = rowIds.map(() => "?").join(", ");
      this.db
        .query(`DELETE FROM messages_fts WHERE rowid IN (${placeholders})`)
        .run(...rowIds);
      this.db
        .query(`DELETE FROM messages WHERE rowid IN (${placeholders})`)
        .run(...rowIds);
    }

    return {
      sessionId,
      userMessage: toStoredMessage(user),
      assistantMessages: rows
        .filter((row) => row.role === "assistant")
        .map(toStoredMessage),
      deletedMessages: rows.length,
    };
  }

  private latestUserMessage(
    sessionId: string,
    options?: { skipSlashCommands?: boolean },
  ): StoredMessageRow | undefined {
    const row = this.db
      .query(
        `
          SELECT rowid, id, session_id as sessionId, room_id as roomId,
            entity_id as entityId, role, text, created_at as createdAt
          FROM messages
          WHERE session_id = ?1
            AND role = 'user'
            AND (?2 = 0 OR substr(ltrim(text), 1, 1) != '/')
          ORDER BY rowid DESC
          LIMIT 1
        `,
      )
      .get(
        sessionId,
        options?.skipSlashCommands ? 1 : 0,
      ) as StoredMessageRow | null;
    return row ?? undefined;
  }
}

interface StoredMessageRow extends StoredMessage {
  rowid: number;
}

function toStoredMessage(row: StoredMessageRow): StoredMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    roomId: row.roomId,
    entityId: row.entityId,
    role: row.role,
    text: row.text,
    createdAt: row.createdAt,
  };
}
