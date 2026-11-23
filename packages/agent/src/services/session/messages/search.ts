import type { SessionSearchResult } from "../../../types/index";
import type { SessionDatabase } from "../database";

export interface SearchableRoom {
  sessionId: string;
  roomId: string;
  messageCount: number;
  checkpointAgent: string | null;
  checkpointAt: string | null;
  checkpointId: string | null;
  checkpointCoversLatest: number;
}

interface ProjectedSearchHit extends SessionSearchResult {
  messageId: string;
  roomId: string;
}

/** Resolve scope from the compact session index and one indexed row per room. */
export function searchableRooms(
  db: SessionDatabase,
  limit: number,
  projectId?: string,
): SearchableRoom[] {
  return db
    .query(`
    WITH scope AS (
      SELECT activity.session_id, activity.message_count FROM session_message_activity activity
      LEFT JOIN session_projects project ON project.session_id = activity.session_id
      WHERE (?2 IS NULL OR project.project_id = ?2)
      ORDER BY activity.ended_at DESC, activity.session_id
      LIMIT ?1
    )
    SELECT scope.session_id AS sessionId, latest.room_id AS roomId,
      scope.message_count AS messageCount, checkpoint.agent_id AS checkpointAgent,
      checkpoint.through_at AS checkpointAt, checkpoint.through_id AS checkpointId,
      CASE WHEN (latest.created_at, latest.id) <= (checkpoint.through_at, checkpoint.through_id)
      THEN 1 ELSE 0 END AS checkpointCoversLatest
    FROM scope
    JOIN messages latest ON latest.rowid = (
      SELECT rowid FROM messages WHERE session_id = scope.session_id
      ORDER BY created_at DESC, id DESC LIMIT 1
    )
    LEFT JOIN session_transcript_checkpoints checkpoint
      ON checkpoint.session_id = scope.session_id AND checkpoint.room_id = latest.room_id
  `)
    .all(limit, projectId ?? null) as SearchableRoom[];
}

export function unverifiedSearchMessages(
  db: SessionDatabase,
  room: SearchableRoom,
  agentId: string,
  limit: number,
): Array<{ id: string; roomId: string; text: string }> {
  const hasCheckpoint = room.checkpointAgent === agentId;
  const statement = hasCheckpoint
    ? db.query(`
      SELECT id, room_id AS roomId, text FROM messages WHERE session_id = ?1
        AND (created_at, id) > (?3, ?4)
      ORDER BY created_at ASC, id ASC LIMIT ?2
    `)
    : db.query(
        "SELECT id, room_id AS roomId, text FROM messages WHERE session_id = ?1 LIMIT ?2",
      );
  return (
    hasCheckpoint
      ? statement.all(
          room.sessionId,
          limit,
          room.checkpointAt,
          room.checkpointId,
        )
      : statement.all(room.sessionId, limit)
  ) as Array<{ id: string; roomId: string; text: string }>;
}

export function projectedSearchMessages(
  db: SessionDatabase,
  ids: string[],
  projectId?: string,
): ProjectedSearchHit[] {
  if (!ids.length) return [];
  return db
    .query(`
      SELECT messages.id AS messageId, messages.room_id AS roomId,
        messages.session_id AS sessionId, messages.created_at AS createdAt,
        messages.role, messages.text, project.project_id AS projectId
      FROM messages LEFT JOIN session_projects project ON project.session_id = messages.session_id
      WHERE messages.id IN (SELECT value FROM json_each(?1))
        AND (?2 IS NULL OR project.project_id = ?2)
    `)
    .all(JSON.stringify(ids), projectId ?? null) as ProjectedSearchHit[];
}

export function searchLegacyMessages(
  db: SessionDatabase,
  query: string,
  limit: number,
  projectId?: string,
  coveredSessions: string[] = [],
): ProjectedSearchHit[] {
  const statement = db.query(`
    SELECT messages.id AS messageId, messages.room_id AS roomId,
      messages_fts.session_id AS sessionId, messages_fts.created_at AS createdAt,
      messages_fts.role, messages_fts.text, project.project_id AS projectId
    FROM messages_fts
    JOIN messages ON messages_fts.rowid = messages.rowid
    LEFT JOIN session_projects project ON project.session_id = messages_fts.session_id
    WHERE messages_fts MATCH ?1 AND (?3 IS NULL OR project.project_id = ?3)
      AND messages_fts.session_id NOT IN (SELECT value FROM json_each(?4))
    ORDER BY rank LIMIT ?2
  `);
  const params = [limit, projectId ?? null, JSON.stringify(coveredSessions)];
  try {
    return statement.all(
      query.replaceAll('"', " "),
      ...params,
    ) as ProjectedSearchHit[];
  } catch (error) {
    // FTS5's operator grammar rejects ordinary inputs such as issue-id:123.
    if (
      !(error instanceof Error) ||
      !/fts5: syntax error|no such column|unterminated string|unknown special query/i.test(
        error.message,
      )
    )
      throw error;
    return statement.all(
      `"${query.replaceAll('"', '""')}"`,
      ...params,
    ) as ProjectedSearchHit[];
  }
}
