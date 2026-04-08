import type { Database } from "bun:sqlite";
import type { SessionSummary } from "@/types";

export interface SessionMetadataValue {
  title?: string;
  continuityKey?: string;
}

export interface SessionMetadataSummaryResolver {
  summarize(sessionId: string, limit?: number): SessionSummary;
  continuityKeyFor(sessionId: string): string;
}

export class SessionMetadataStore {
  constructor(
    private readonly db: Database,
    private readonly summaryResolver: SessionMetadataSummaryResolver,
  ) {}

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
    return this.summaryResolver.summarize(sessionId);
  }

  metadata(sessionId: string): SessionMetadataValue | undefined {
    const row = this.db
      .query(
        `
          SELECT title, continuity_key as continuityKey
          FROM session_metadata
          WHERE session_id = ?1
        `,
      )
      .get(sessionId) as SessionMetadataValue | null;
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
