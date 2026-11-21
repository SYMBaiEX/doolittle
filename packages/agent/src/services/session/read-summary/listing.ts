import type { SessionSummary } from "../../../types/index";
import type { SessionDatabase } from "../database";
import {
  buildSessionSummary,
  describeSessionMessages,
  prepareSessionMessageRows,
} from "./query";
import type { SessionMetadataResolver } from "./types";

export function listSessionSummaries(
  db: SessionDatabase,
  limit: number,
  projectId?: string,
  offset = 0,
): SessionSummary[] {
  const rows = db
    .query(
      `
        WITH recent AS (
          SELECT
            activity.session_id as sessionId,
            activity.message_count as messageCount,
            activity.started_at as startedAt,
            activity.ended_at as endedAt
          FROM session_message_activity activity
          ${projectId ? "INNER JOIN session_projects ON session_projects.session_id = activity.session_id WHERE session_projects.project_id = ?3" : ""}
          ORDER BY endedAt DESC, sessionId ASC
          LIMIT ?1 OFFSET ?2
        )
        SELECT recent.*, project.project_id as projectId, metadata.title,
          metadata.continuity_key as continuityKey,
          lineage.parent_session_id as parentSessionId,
          lineage.forked_from_message_id as forkedFromMessageId,
          lineage.root_session_id as rootSessionId
        FROM recent
        LEFT JOIN session_projects project ON project.session_id = recent.sessionId
        LEFT JOIN session_metadata metadata ON metadata.session_id = recent.sessionId
        LEFT JOIN session_lineage lineage ON lineage.session_id = metadata.session_id
        ORDER BY recent.endedAt DESC, recent.sessionId ASC
      `,
    )
    .all(
      ...(projectId ? [limit, offset, projectId] : [limit, offset]),
    ) as Array<{
    sessionId: string;
    messageCount: number;
    startedAt: string;
    endedAt: string;
    projectId: string | null;
    title: string | null;
    continuityKey: string | null;
    parentSessionId: string | null;
    forkedFromMessageId: string | null;
    rootSessionId: string | null;
  }>;

  if (!rows.length) return [];
  const readPreview = prepareSessionMessageRows(db);
  return rows.map((row) => ({
    sessionId: row.sessionId,
    projectId: row.projectId ?? undefined,
    title: row.title ?? undefined,
    continuityKey: row.continuityKey ?? undefined,
    parentSessionId: row.parentSessionId ?? undefined,
    forkedFromMessageId: row.forkedFromMessageId ?? undefined,
    rootSessionId: row.rootSessionId ?? undefined,
    messageCount: row.messageCount,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    ...describeSessionMessages(readPreview(row.sessionId, 6)),
  }));
}

export function listTitledSessions(
  db: SessionDatabase,
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
