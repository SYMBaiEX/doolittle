import type { EventEmitter } from "node:events";
import type {
  SessionExchangeMutationResult,
  SessionSearchResult,
  StoredMessage,
  StoredMessageAttachment,
} from "../../../types/index";
import type { SessionDatabase, SessionStatement } from "../database";
import { loadSessionMessageCount } from "../read-summary/query";

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

export interface SessionRunTranscriptPage {
  messages: StoredMessage[];
  hasEarlier: boolean;
  nextOffset: number;
  throughMessageId?: string;
  terminalStatus: "complete" | "cancelled" | "error";
}

export interface SessionTranscriptPage {
  messages: StoredMessage[];
  hasEarlier: boolean;
  nextOffset: number;
  totalMessages: number;
}

const transcriptSelection = `
  SELECT messages.id, messages.session_id as sessionId,
    messages.room_id as roomId, messages.entity_id as entityId,
    messages.role, messages.text,
    messages.attachments_json as attachmentsJson,
    messages.created_at as createdAt,
    message_origins.origin_message_id as originMessageId
  FROM messages
  LEFT JOIN message_origins ON message_origins.message_id = messages.id
  WHERE messages.session_id = ?1
`;

function transcriptPageWindow(total: number, limit: number, offset: number) {
  const pageSize = Math.min(limit, Math.max(0, total - offset));
  const oldestOffset = Math.max(0, total - offset - pageSize);
  const newestFirst = offset <= oldestOffset;
  return {
    pageSize,
    newestFirst,
    pageOffset: newestFirst ? offset : oldestOffset,
  };
}

export class SessionRunBoundaryUnavailableError extends Error {
  constructor() {
    super("The exact transcript boundary for this run is unavailable.");
  }
}

export class SessionMessageStore {
  private insertMessageStatement?: SessionStatement;
  private insertSearchStatement?: SessionStatement;
  private recentMessagesStatement?: SessionStatement;

  constructor(
    private readonly db: SessionDatabase,
    private readonly events: Pick<EventEmitter, "emit" | "on" | "off">,
  ) {}

  storeMessage(message: StoredMessage): void {
    if (this.insertMessage(message)) this.emitActivity(message);
  }

  storeMessageWithMetadata(
    message: StoredMessage,
    writeMetadata: () => void,
  ): void {
    let inserted: boolean;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      inserted = this.insertMessage(message);
      if (inserted) writeMetadata();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (inserted) this.emitActivity(message);
  }

  replaceSessionMessages(sessionId: string, messages: StoredMessage[]): void {
    const inserted: StoredMessage[] = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .query(
          `DELETE FROM message_origins WHERE message_id IN (
            SELECT id FROM messages WHERE session_id = ?1
          )`,
        )
        .run(sessionId);
      this.db
        .query(
          `DELETE FROM messages_fts WHERE rowid IN (
            SELECT rowid FROM messages WHERE session_id = ?1
          )`,
        )
        .run(sessionId);
      this.db
        .query("DELETE FROM messages WHERE session_id = ?1")
        .run(sessionId);

      for (const message of messages) {
        const replacement = {
          ...message,
          sessionId,
        };
        if (this.insertMessage(replacement)) {
          inserted.push(replacement);
        }
      }
      // A replacement can preserve IDs while changing their order or content.
      // Never let an old run silently resolve against that new transcript.
      this.db
        .query("DELETE FROM run_message_boundaries WHERE session_id = ?1")
        .run(sessionId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    for (const message of inserted) {
      this.emitActivity(message);
    }
  }

  private insertMessage(message: StoredMessage): boolean {
    this.insertMessageStatement ??= this.db.query(`
      INSERT OR IGNORE INTO messages (
        id, session_id, room_id, entity_id, role, text,
        attachments_json, created_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `);
    const insert = this.insertMessageStatement.run(
      message.id,
      message.sessionId,
      message.roomId,
      message.entityId,
      message.role,
      message.text,
      serializeAttachments(message.attachments),
      message.createdAt,
    );
    if (insert.changes === 0) return false;

    this.insertSearchStatement ??= this.db.query(`
      INSERT INTO messages_fts (rowid, session_id, room_id, entity_id, role, text, created_at)
      VALUES (last_insert_rowid(), ?1, ?2, ?3, ?4, ?5, ?6)
    `);
    this.insertSearchStatement.run(
      message.sessionId,
      message.roomId,
      message.entityId,
      message.role,
      message.text,
      message.createdAt,
    );

    return true;
  }

  private emitActivity(message: StoredMessage): void {
    this.events.emit("activity", {
      kind: "message",
      sessionId: message.sessionId,
      role: message.role,
      detail: `[${message.role}] ${message.text.slice(0, 160)}`,
    } satisfies SessionMessageActivityEvent);
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
            messages_fts.role, messages_fts.text, session_projects.project_id as projectId
          FROM messages_fts
          LEFT JOIN session_projects ON session_projects.session_id = messages_fts.session_id
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

  messagesBySession(
    sessionId: string,
    limit: number,
    offset = 0,
  ): StoredMessage[] {
    const rows = this.db
      .query(
        `
          ${transcriptSelection}
          ORDER BY messages.created_at ASC, messages.rowid ASC
          LIMIT ?2
          OFFSET ?3
        `,
      )
      .all(sessionId, limit, offset) as StoredMessageRow[];
    return rows.map(toStoredMessage);
  }

  messagesPage(
    sessionId: string,
    limit: number,
    offset = 0,
  ): SessionTranscriptPage {
    const totalMessages = loadSessionMessageCount(this.db, sessionId);
    const { pageSize, newestFirst, pageOffset } = transcriptPageWindow(
      totalMessages,
      limit,
      offset,
    );
    // Offset is measured from the newest end. Scan the index from the closer
    // end, then return the small page in conversation order.
    let messages: StoredMessage[];
    if (newestFirst) {
      this.recentMessagesStatement ??= this.db.query(`
        ${transcriptSelection}
        ORDER BY messages.created_at DESC, messages.rowid DESC
        LIMIT ?2 OFFSET ?3
      `);
      const rows = this.recentMessagesStatement.all(
        sessionId,
        pageSize,
        pageOffset,
      ) as StoredMessageRow[];
      messages = rows.reverse().map(toStoredMessage);
    } else {
      messages = this.messagesBySession(sessionId, pageSize, pageOffset);
    }
    return {
      messages,
      hasEarlier: offset + messages.length < totalMessages,
      nextOffset: offset + messages.length,
      totalMessages,
    };
  }

  recordRunTerminalBoundary(
    runId: string,
    sessionId: string,
    status: "complete" | "cancelled" | "error",
  ): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .query(
          "SELECT session_id as sessionId, status FROM run_message_boundaries WHERE run_id = ?1",
        )
        .get(runId) as { sessionId: string; status: string } | null;
      if (existing) {
        if (existing.sessionId !== sessionId || existing.status !== status) {
          throw new Error("Run transcript boundary conflicts with its owner.");
        }
      } else {
        const last = this.db
          .query(
            "SELECT id FROM messages WHERE session_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT 1",
          )
          .get(sessionId) as { id: string } | null;
        this.db
          .query(
            `INSERT INTO run_message_boundaries
              (run_id, session_id, through_message_id, message_count, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
          )
          .run(
            runId,
            sessionId,
            last?.id ?? null,
            loadSessionMessageCount(this.db, sessionId),
            status,
            new Date().toISOString(),
          );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  messagesThroughRun(
    runId: string,
    sessionId: string,
    limit: number,
    offset = 0,
  ): SessionRunTranscriptPage {
    const boundary = this.db
      .query(
        `SELECT through_message_id as throughMessageId,
          message_count as messageCount, status
         FROM run_message_boundaries
         WHERE run_id = ?1 AND session_id = ?2`,
      )
      .get(runId, sessionId) as {
      throughMessageId: string | null;
      messageCount: number;
      status: SessionRunTranscriptPage["terminalStatus"];
    } | null;
    if (!boundary) throw new SessionRunBoundaryUnavailableError();
    if (!boundary.throughMessageId) {
      if (boundary.messageCount !== 0)
        throw new SessionRunBoundaryUnavailableError();
      return {
        messages: [],
        hasEarlier: false,
        nextOffset: offset,
        terminalStatus: boundary.status,
      };
    }
    const anchor = this.db
      .query(
        "SELECT created_at as createdAt, rowid FROM messages WHERE session_id = ?1 AND id = ?2",
      )
      .get(sessionId, boundary.throughMessageId) as {
      createdAt: string;
      rowid: number;
    } | null;
    if (!anchor) throw new SessionRunBoundaryUnavailableError();
    const current = this.db
      .query(`
        SELECT COUNT(*) as count FROM messages
        WHERE session_id = ?1 AND (created_at, rowid) <= (?2, ?3)
      `)
      .get(sessionId, anchor.createdAt, anchor.rowid) as {
      count: number;
    };
    if (current.count !== boundary.messageCount)
      throw new SessionRunBoundaryUnavailableError();
    const { pageSize, newestFirst, pageOffset } = transcriptPageWindow(
      current.count,
      limit,
      offset,
    );
    const order = newestFirst ? "DESC" : "ASC";
    const rows = this.db
      .query(
        `${transcriptSelection}
         AND (messages.created_at, messages.rowid) <= (?2, ?3)
         ORDER BY messages.created_at ${order}, messages.rowid ${order}
         LIMIT ?4 OFFSET ?5`,
      )
      .all(
        sessionId,
        anchor.createdAt,
        anchor.rowid,
        pageSize,
        pageOffset,
      ) as StoredMessageRow[];
    return {
      messages: (newestFirst ? rows.reverse() : rows).map(toStoredMessage),
      hasEarlier: offset + rows.length < current.count,
      nextOffset: offset + rows.length,
      throughMessageId: boundary.throughMessageId,
      terminalStatus: boundary.status,
    };
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
