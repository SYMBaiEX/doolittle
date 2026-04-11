import type { Database } from "bun:sqlite";
import type { AdvancedSessionSummary } from "../service";
import { makeAssignmentBuilder } from "./sql";
import type { SessionSummaryRow } from "./types";

export function insertSessionSummary(
  db: Database,
  s: AdvancedSessionSummary,
): void {
  db.query(
    `
      INSERT INTO session_summaries (
        id, agent_id, room_id, entity_id, summary, message_count,
        last_message_offset, start_time, end_time, topics, metadata,
        embedding, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    `,
  ).run(
    s.id,
    s.agentId,
    s.roomId,
    s.entityId ?? null,
    s.summary,
    s.messageCount,
    s.lastMessageOffset,
    s.startTime.toISOString(),
    s.endTime.toISOString(),
    s.topics ? JSON.stringify(s.topics) : null,
    s.metadata ? JSON.stringify(s.metadata) : null,
    s.embedding ? JSON.stringify(s.embedding) : null,
    s.createdAt.toISOString(),
    s.updatedAt.toISOString(),
  );
}

export function selectCurrentSessionSummary(
  db: Database,
  agentId: string,
  roomId: string,
): SessionSummaryRow | null {
  return db
    .query(
      `
        SELECT * FROM session_summaries
        WHERE agent_id = ?1 AND room_id = ?2
        ORDER BY end_time DESC, updated_at DESC
        LIMIT 1
      `,
    )
    .get(agentId, roomId) as SessionSummaryRow | null;
}

export function selectSessionSummaries(
  db: Database,
  agentId: string,
  roomId: string,
  limit: number,
): SessionSummaryRow[] {
  return db
    .query(
      `
        SELECT * FROM session_summaries
        WHERE agent_id = ?1 AND room_id = ?2
        ORDER BY end_time DESC, updated_at DESC
        LIMIT ?3
      `,
    )
    .all(agentId, roomId, limit) as SessionSummaryRow[];
}

export function patchSessionSummary(
  db: Database,
  id: string,
  agentId: string,
  roomId: string,
  updates: Partial<
    Omit<
      AdvancedSessionSummary,
      "id" | "agentId" | "roomId" | "createdAt" | "updatedAt"
    >
  >,
): void {
  const b = makeAssignmentBuilder();

  if (updates.entityId !== undefined)
    b.push("entity_id", updates.entityId ?? null);
  if (updates.summary !== undefined) b.push("summary", updates.summary);
  if (updates.messageCount !== undefined)
    b.push("message_count", updates.messageCount);
  if (updates.lastMessageOffset !== undefined)
    b.push("last_message_offset", updates.lastMessageOffset);
  if (updates.startTime !== undefined)
    b.push("start_time", updates.startTime.toISOString());
  if (updates.endTime !== undefined)
    b.push("end_time", updates.endTime.toISOString());
  if (updates.topics !== undefined)
    b.push("topics", JSON.stringify(updates.topics));
  if (updates.metadata !== undefined)
    b.push("metadata", JSON.stringify(updates.metadata));
  if (updates.embedding !== undefined)
    b.push("embedding", JSON.stringify(updates.embedding));

  b.push("updated_at", new Date().toISOString());
  const vals = [...b.values, id, agentId, roomId];
  const n = vals.length;

  db.query(
    `
      UPDATE session_summaries
      SET ${b.assignments.join(", ")}
      WHERE id = ?${n - 2}
        AND agent_id = ?${n - 1}
        AND room_id = ?${n}
    `,
  ).run(...vals);
}
