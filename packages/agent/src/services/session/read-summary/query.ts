import type { Database } from "bun:sqlite";
import type { SessionSearchResult, SessionSummary } from "@/types";
import type { SessionMessageRow, SessionMetadataResolver } from "./types";

export function loadSummaryStats(
  db: Database,
  limit: number,
): {
  totalSessions: number;
  recentRows: SessionSearchResult[];
} {
  const total = db
    .query(
      `
        SELECT COUNT(DISTINCT session_id) as count
        FROM messages
      `,
    )
    .get() as { count: number };

  const recentRows = db
    .query(
      `
        SELECT session_id as sessionId, created_at as createdAt, role, text
        FROM messages
        ORDER BY created_at DESC
        LIMIT ?1
      `,
    )
    .all(limit) as SessionSearchResult[];

  return {
    totalSessions: total.count,
    recentRows,
  };
}

export function loadSessionMessageRows(
  db: Database,
  sessionId: string,
  limit: number,
): SessionMessageRow[] {
  return db
    .query(
      `
        SELECT session_id as sessionId, created_at as createdAt, role, text
        FROM messages
        WHERE session_id = ?1
        ORDER BY created_at ASC
        LIMIT ?2
      `,
    )
    .all(sessionId, limit) as SessionMessageRow[];
}

export function loadSessionMessageCount(
  db: Database,
  sessionId: string,
): number {
  return (
    db
      .query(
        `
          SELECT COUNT(*) as count
          FROM messages
          WHERE session_id = ?1
        `,
      )
      .get(sessionId) as { count: number }
  ).count;
}

export function buildSessionSummary(
  db: Database,
  metadataResolver: SessionMetadataResolver,
  sessionId: string,
  rowLimit: number,
): SessionSummary {
  const rows = loadSessionMessageRows(db, sessionId, rowLimit);
  const metadata = metadataResolver.metadata(sessionId);

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

  const total = loadSessionMessageCount(db, sessionId);

  return {
    sessionId,
    title: metadata?.title,
    continuityKey: metadata?.continuityKey,
    messageCount: total,
    startedAt: rows[0]?.createdAt,
    endedAt: rows.at(-1)?.createdAt,
    participants: Array.from(new Set(rows.map((row) => row.role))),
    preview: rows.map((row) => `[${row.role}] ${row.text.slice(0, 200)}`),
  };
}
