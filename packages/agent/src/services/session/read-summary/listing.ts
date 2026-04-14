import type { Database } from "bun:sqlite";
import type { SessionSummary } from "@/types";
import { buildSessionSummary } from "./query";
import type { SessionMetadataResolver } from "./types";

export function listSessionSummaries(
  db: Database,
  metadataResolver: SessionMetadataResolver,
  limit: number,
): SessionSummary[] {
  const rows = db
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
    const summary = buildSessionSummary(db, metadataResolver, row.sessionId, 6);
    return {
      ...summary,
      messageCount: row.messageCount,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
    };
  });
}

export function listTitledSessions(
  db: Database,
  metadataResolver: SessionMetadataResolver,
  limit: number,
): SessionSummary[] {
  const rows = db
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

  return rows.map((row) =>
    buildSessionSummary(db, metadataResolver, row.sessionId, 6),
  );
}
