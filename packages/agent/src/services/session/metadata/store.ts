import type { SessionSummary } from "../../../types/index";
import type { SessionDatabase, SessionStatement } from "../database";

export interface SessionMetadataValue {
  title?: string;
  continuityKey?: string;
  parentSessionId?: string;
  forkedFromMessageId?: string;
  rootSessionId?: string;
}

export interface SessionMetadataSummaryResolver {
  summarize(sessionId: string, limit?: number): SessionSummary;
  continuityKeyFor(sessionId: string): string;
}

export class SessionMetadataStore {
  private canInitializeTitleStatement?: SessionStatement;
  private initializeTitleStatement?: SessionStatement;

  constructor(
    private readonly db: SessionDatabase,
    private readonly summaryResolver: SessionMetadataSummaryResolver,
  ) {}

  rename(sessionId: string, title: string): SessionSummary {
    const normalized = title.trim();
    if (!normalized) {
      throw new Error("Session title cannot be empty.");
    }
    const continuityKey = this.continuityKey(sessionId);
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
    return this.summaryResolver.summarize(sessionId);
  }

  canInitializeTitle(sessionId: string): boolean {
    this.canInitializeTitleStatement ??= this.db.query(`
      SELECT NOT EXISTS (
        SELECT 1 FROM messages WHERE session_id = ?1 AND role = 'user'
      ) AND NOT EXISTS (
        SELECT 1 FROM session_metadata WHERE session_id = ?1 AND title IS NOT NULL
      ) AS eligible
    `);
    return Boolean(
      (this.canInitializeTitleStatement.get(sessionId) as { eligible: number })
        .eligible,
    );
  }

  initializeTitle(sessionId: string, messageId: string, title: string): void {
    this.initializeTitleStatement ??= this.db.query(`
      INSERT INTO session_metadata (session_id, title, continuity_key, updated_at)
      SELECT ?1, ?3, ?4, ?5
      WHERE NOT EXISTS (
        SELECT 1 FROM messages
        WHERE session_id = ?1 AND role = 'user' AND id != ?2
      )
      ON CONFLICT(session_id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at
      WHERE session_metadata.title IS NULL
    `);
    this.initializeTitleStatement.run(
      sessionId,
      messageId,
      title,
      this.continuityKey(sessionId),
      new Date().toISOString(),
    );
  }

  /**
   * Initialize a generated title exactly once. Unlike rename, an existing
   * non-empty title (user-named or previously claimed) is never overwritten;
   * unlike initializeTitle, no first-user-message ordering is required, so
   * non-interactive sources can claim a title before any message persists.
   */
  claimTitle(sessionId: string, title: string): boolean {
    const normalized = title.trim();
    if (!normalized) return false;
    const result = this.db
      .query(
        `
          INSERT INTO session_metadata (session_id, title, continuity_key, updated_at)
          VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT(session_id) DO UPDATE SET
            title = excluded.title,
            updated_at = excluded.updated_at
          WHERE session_metadata.title IS NULL
            OR TRIM(session_metadata.title) = ''
        `,
      )
      .run(
        sessionId,
        normalized,
        this.continuityKey(sessionId),
        new Date().toISOString(),
      );
    return result.changes > 0;
  }

  metadata(sessionId: string): SessionMetadataValue | undefined {
    const row = this.db
      .query(
        `
          SELECT metadata.title, metadata.continuity_key as continuityKey,
            lineage.parent_session_id as parentSessionId,
            lineage.forked_from_message_id as forkedFromMessageId,
            lineage.root_session_id as rootSessionId
          FROM session_metadata metadata
          LEFT JOIN session_lineage lineage
            ON lineage.session_id = metadata.session_id
          WHERE metadata.session_id = ?1
        `,
      )
      .get(sessionId) as SessionMetadataRow | null;
    return row ? toMetadataValue(row) : undefined;
  }

  recordFork(
    parentSessionId: string,
    sessionId: string,
    forkedFromMessageId: string,
  ): {
    continuityKey: string;
    rootSessionId: string;
  } {
    if (
      this.db
        .query(
          "SELECT 1 as found FROM session_lineage WHERE session_id = ?1 LIMIT 1",
        )
        .get(sessionId)
    ) {
      throw new Error(`Session metadata already exists for ${sessionId}.`);
    }

    const parent = this.metadata(parentSessionId);
    const continuityKey =
      parent?.continuityKey ?? this.continuityKeyFor(parentSessionId);
    const rootSessionId = parent?.rootSessionId ?? parentSessionId;
    const now = new Date().toISOString();

    this.db
      .query(
        `
          INSERT INTO session_metadata (session_id, continuity_key, updated_at)
          VALUES (?1, ?2, ?3)
          ON CONFLICT(session_id) DO UPDATE SET
            continuity_key = COALESCE(session_metadata.continuity_key, excluded.continuity_key),
            updated_at = excluded.updated_at
        `,
      )
      .run(rootSessionId, continuityKey, now);

    if (parentSessionId !== rootSessionId) {
      this.db
        .query(
          `
            INSERT INTO session_metadata (session_id, continuity_key, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(session_id) DO UPDATE SET
              continuity_key = COALESCE(session_metadata.continuity_key, excluded.continuity_key),
              updated_at = excluded.updated_at
          `,
        )
        .run(parentSessionId, continuityKey, now);
    }

    this.db
      .query(
        `
          INSERT INTO session_metadata (
            session_id, title, continuity_key, updated_at
          )
          VALUES (?1, ?2, ?3, ?4)
        `,
      )
      .run(sessionId, parent?.title ?? null, continuityKey, now);

    this.db
      .query(
        `
          INSERT INTO session_lineage (
            session_id, parent_session_id, forked_from_message_id,
            root_session_id, created_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5)
        `,
      )
      .run(sessionId, parentSessionId, forkedFromMessageId, rootSessionId, now);

    return { continuityKey, rootSessionId };
  }

  continuity(sessionId: string, limit = 20): SessionSummary[] {
    const continuityKey = this.continuityKey(sessionId);
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
    return rows.map((row) => this.summaryResolver.summarize(row.sessionId, 6));
  }

  continuityKey(sessionId: string): string {
    return (
      this.metadata(sessionId)?.continuityKey ??
      this.continuityKeyFor(sessionId)
    );
  }

  private continuityKeyFor(sessionId: string): string {
    return this.summaryResolver.continuityKeyFor(sessionId);
  }
}

interface SessionMetadataRow {
  title: string | null;
  continuityKey: string | null;
  parentSessionId: string | null;
  forkedFromMessageId: string | null;
  rootSessionId: string | null;
}

function toMetadataValue(row: SessionMetadataRow): SessionMetadataValue {
  return {
    title: row.title ?? undefined,
    continuityKey: row.continuityKey ?? undefined,
    parentSessionId: row.parentSessionId ?? undefined,
    forkedFromMessageId: row.forkedFromMessageId ?? undefined,
    rootSessionId: row.rootSessionId ?? undefined,
  };
}
