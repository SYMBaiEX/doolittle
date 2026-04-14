import type { Database } from "bun:sqlite";
import type { SessionSummary } from "@/types";
import { buildSessionSummary } from "./query";
import type { SessionMetadataResolver } from "./types";

export function findContinuitySessions(
  db: Database,
  metadataResolver: SessionMetadataResolver,
  sessionId: string,
  limit: number,
): SessionSummary[] {
  const continuityKey = metadataResolver.continuityKeyFor(sessionId);
  const rows = db
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

  return rows.map((row) =>
    buildSessionSummary(db, metadataResolver, row.sessionId, 6),
  );
}
