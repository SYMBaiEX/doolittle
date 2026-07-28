import type { EventEmitter } from "node:events";
import type { SessionDatabase } from "@/services/session/database";
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

export interface SessionTranscriptPrefix {
  messages: StoredMessage[];
  boundaryMessageId?: string;
  copiedThroughMessageId?: string;
  truncated: boolean;
}

export class SessionMessageStore {
  constructor(
    private readonly db: SessionDatabase,
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
        .query(
          `DELETE FROM message_origins WHERE message_id IN (
            SELECT id FROM messages WHERE rowid IN (${placeholders})
          )`,
        )
        .run(...rowIds);
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

  search(
    query: string,
    limit: number,
    projectId?: string,
  ): SessionSearchResult[] {
    return this.db
      .query(
        `
          SELECT messages_fts.session_id as sessionId, messages_fts.created_at as createdAt,
            messages_fts.role, messages_fts.text${projectId ? ", session_projects.project_id as projectId" : ""}
          FROM messages_fts
          ${projectId ? "INNER JOIN session_projects ON session_projects.session_id = messages_fts.session_id" : ""}
          WHERE messages_fts MATCH ?1
          ${projectId ? "AND session_projects.project_id = ?3" : ""}
          ORDER BY rank
          LIMIT ?2
        `,
      )
      .all(
        ...(projectId
          ? [query.replaceAll('"', " "), limit, projectId]
          : [query.replaceAll('"', " "), limit]),
      ) as SessionSearchResult[];
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
          SELECT messages.id, messages.session_id as sessionId,
            messages.room_id as roomId, messages.entity_id as entityId,
            messages.role, messages.text,
            messages.attachments_json as attachmentsJson,
            messages.created_at as createdAt,
            message_origins.origin_message_id as originMessageId
          FROM messages
          LEFT JOIN message_origins ON message_origins.message_id = messages.id
          WHERE messages.session_id = ?1
          ORDER BY messages.created_at ASC, messages.rowid ASC
          LIMIT ?2
        `,
      )
      .all(sessionId, limit) as StoredMessageRow[];
    return rows.map(toStoredMessage);
  }

  transcriptPrefix(
    sessionId: string,
    boundary:
      | { mode: "before"; messageId: string }
      | { mode: "full" }
      | { mode: "through"; messageId: string },
    limit: number,
  ): SessionTranscriptPrefix {
    const boundaryRow =
      boundary.mode === "full"
        ? undefined
        : (this.db
            .query(
              `
                SELECT rowid, created_at as createdAt
                FROM messages
                WHERE session_id = ?1 AND id = ?2
                LIMIT 1
              `,
            )
            .get(sessionId, boundary.messageId) as {
            rowid: number;
            createdAt: string;
          } | null);
    if (boundary.mode !== "full" && !boundaryRow) {
      return {
        messages: [],
        boundaryMessageId: undefined,
        copiedThroughMessageId: undefined,
        truncated: false,
      };
    }
    const boundaryPredicate =
      boundary.mode === "full"
        ? ""
        : boundary.mode === "through"
          ? `AND (
              messages.created_at < ?3
              OR (messages.created_at = ?3 AND messages.rowid <= ?4)
            )`
          : `AND (
              messages.created_at < ?3
              OR (messages.created_at = ?3 AND messages.rowid < ?4)
            )`;
    const params =
      boundary.mode === "full"
        ? [sessionId, limit + 1]
        : [sessionId, limit + 1, boundaryRow?.createdAt, boundaryRow?.rowid];
    const rows = this.db
      .query(
        `
          SELECT messages.rowid, messages.id,
            messages.session_id as sessionId, messages.room_id as roomId,
            messages.entity_id as entityId, messages.role, messages.text,
            messages.attachments_json as attachmentsJson,
            messages.created_at as createdAt,
            message_origins.origin_message_id as originMessageId
          FROM messages
          LEFT JOIN message_origins ON message_origins.message_id = messages.id
          WHERE messages.session_id = ?1
          ${boundaryPredicate}
          ORDER BY messages.created_at ASC, messages.rowid ASC
          LIMIT ?2
        `,
      )
      .all(...params) as StoredMessageRow[];
    const included = rows.slice(0, limit);
    return {
      messages: included.map(toStoredMessage),
      boundaryMessageId:
        boundary.mode === "full" ? included.at(-1)?.id : boundary.messageId,
      copiedThroughMessageId: included.at(-1)?.id,
      truncated: rows.length > limit,
    };
  }

  hasSession(sessionId: string): boolean {
    const row = this.db
      .query(
        `
          SELECT 1 as found
          FROM messages
          WHERE session_id = ?1
          LIMIT 1
        `,
      )
      .get(sessionId) as { found: number } | null;
    return Boolean(row);
  }

  copyMessagesToSession(
    sourceSessionId: string,
    sessionId: string,
    messages: StoredMessage[],
    createMessageId: () => string,
  ): StoredMessage[] {
    const copiedAt = new Date().toISOString();
    return messages.map((message) => {
      const copy = {
        ...message,
        id: createMessageId(),
        originMessageId: message.originMessageId ?? message.id,
        sessionId,
        roomId: sessionId,
      };
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
          copy.id,
          copy.sessionId,
          copy.roomId,
          copy.entityId,
          copy.role,
          copy.text,
          serializeAttachments(copy.attachments),
          copy.createdAt,
        );
      const row = this.db
        .query("SELECT rowid FROM messages WHERE id = ?1")
        .get(copy.id) as { rowid: number };
      this.db
        .query(
          `
            INSERT INTO messages_fts (
              rowid, session_id, room_id, entity_id, role, text, created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          `,
        )
        .run(
          row.rowid,
          copy.sessionId,
          copy.roomId,
          copy.entityId,
          copy.role,
          copy.text,
          copy.createdAt,
        );
      this.db
        .query(
          `
            INSERT INTO message_origins (
              message_id, origin_message_id, source_session_id, created_at
            )
            VALUES (?1, ?2, ?3, ?4)
          `,
        )
        .run(copy.id, copy.originMessageId, sourceSessionId, copiedAt);
      return copy;
    });
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
        .query(
          `DELETE FROM message_origins WHERE message_id IN (
            SELECT id FROM messages WHERE rowid IN (${placeholders})
          )`,
        )
        .run(...rowIds);
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
    originMessageId: row.originMessageId ?? undefined,
    sessionId: row.sessionId,
    roomId: row.roomId,
    entityId: row.entityId,
    role: row.role,
    text: row.text,
    attachments: parseAttachments(row.attachmentsJson),
    createdAt: row.createdAt,
  };
}
