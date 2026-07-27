import type { Database } from "bun:sqlite";
import type { EventEmitter } from "node:events";
import type {
  SessionExchangeMutationResult,
  SessionSearchResult,
  StoredMessage,
  StoredMessageAttachment,
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
          INSERT INTO messages (
            id, session_id, room_id, entity_id, role, text,
            attachments_json, created_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        `,
      )
      .run(
        message.id,
        message.sessionId,
        message.roomId,
        message.entityId,
        message.role,
        message.text,
        serializeAttachments(message.attachments),
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
    const rows = this.db
      .query(
        `
          SELECT id, session_id as sessionId, room_id as roomId,
            entity_id as entityId, role, text,
            attachments_json as attachmentsJson, created_at as createdAt
          FROM messages
          WHERE session_id = ?1
          ORDER BY created_at ASC
          LIMIT ?2
        `,
      )
      .all(sessionId, limit) as StoredMessageRow[];
    return rows.map(toStoredMessage);
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
            entity_id as entityId, role, text,
            attachments_json as attachmentsJson, created_at as createdAt
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
            entity_id as entityId, role, text,
            attachments_json as attachmentsJson, created_at as createdAt
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
  attachmentsJson?: string | null;
}

function serializeAttachments(
  attachments: StoredMessageAttachment[] | undefined,
): string | null {
  return attachments?.length
    ? JSON.stringify(
        attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          kind: attachment.kind,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          sha256: attachment.sha256,
        })),
      )
    : null;
}

function parseAttachments(
  value: string | null | undefined,
): StoredMessageAttachment[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const attachments = parsed.flatMap((entry): StoredMessageAttachment[] => {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.id !== "string" ||
        typeof entry.name !== "string" ||
        typeof entry.kind !== "string" ||
        !["audio", "document", "image", "video"].includes(entry.kind) ||
        typeof entry.mimeType !== "string" ||
        typeof entry.sizeBytes !== "number" ||
        typeof entry.sha256 !== "string"
      ) {
        return [];
      }
      return [
        {
          id: entry.id,
          name: entry.name,
          kind: entry.kind as StoredMessageAttachment["kind"],
          mimeType: entry.mimeType,
          sizeBytes: entry.sizeBytes,
          sha256: entry.sha256,
        },
      ];
    });
    return attachments.length ? attachments : undefined;
  } catch {
    return undefined;
  }
}

function toStoredMessage(row: StoredMessageRow): StoredMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    roomId: row.roomId,
    entityId: row.entityId,
    role: row.role,
    text: row.text,
    attachments: parseAttachments(row.attachmentsJson),
    createdAt: row.createdAt,
  };
}
