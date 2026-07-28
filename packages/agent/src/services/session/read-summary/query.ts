import type { SessionDatabase } from "@/services/session/database";
import type { SessionSearchResult, SessionSummary } from "@/types";
import type { SessionMessageRow, SessionMetadataResolver } from "./types";

export function loadSummaryStats(
  db: SessionDatabase,
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
  db: SessionDatabase,
  sessionId: string,
  limit: number,
): SessionMessageRow[] {
  return db
    .query(
      `
        SELECT session_id as sessionId, created_at as createdAt, role, text
        FROM messages
        WHERE session_id = ?1
        ORDER BY created_at ASC, rowid ASC
        LIMIT ?2
      `,
    )
    .all(sessionId, limit) as SessionMessageRow[];
}

export function loadSessionMessageCount(
  db: SessionDatabase,
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
  db: SessionDatabase,
  metadataResolver: SessionMetadataResolver,
  sessionId: string,
  rowLimit: number,
): SessionSummary {
  const rows = loadSessionMessageRows(db, sessionId, rowLimit);
  const metadata = metadataResolver.metadata(sessionId);
  const projectId = metadataResolver.projectIdForSession?.(sessionId);

  if (!rows.length) {
    return {
      sessionId,
      projectId,
      title: metadata?.title,
      continuityKey: metadata?.continuityKey,
      parentSessionId: metadata?.parentSessionId,
      forkedFromMessageId: metadata?.forkedFromMessageId,
      rootSessionId: metadata?.rootSessionId,
      messageCount: 0,
      participants: [],
      preview: [],
    };
  }

  const total = loadSessionMessageCount(db, sessionId);

  return {
    sessionId,
    projectId,
    title: metadata?.title,
    continuityKey: metadata?.continuityKey,
    parentSessionId: metadata?.parentSessionId,
    forkedFromMessageId: metadata?.forkedFromMessageId,
    rootSessionId: metadata?.rootSessionId,
    messageCount: total,
    startedAt: rows[0]?.createdAt,
    endedAt: rows.at(-1)?.createdAt,
    participants: Array.from(new Set(rows.map((row) => row.role))),
    preview: rows.map((row) => `[${row.role}] ${row.text.slice(0, 200)}`),
  };
}
