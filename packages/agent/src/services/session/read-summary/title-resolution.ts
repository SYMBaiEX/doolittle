import type { Database } from "bun:sqlite";
import type { SessionSummary } from "@/types";
import { buildSessionSummary } from "./query";
import type { SessionMetadataResolver } from "./types";

export function resolveSessionByTitle(
  db: Database,
  metadataResolver: SessionMetadataResolver,
  query: string,
): SessionSummary | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const exact = db
    .query(
      `
        SELECT session_id as sessionId
        FROM session_metadata
        WHERE LOWER(title) = ?1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(normalized) as { sessionId: string } | null;

  if (exact?.sessionId) {
    return buildSessionSummary(db, metadataResolver, exact.sessionId, 6);
  }

  const fuzzy = db
    .query(
      `
        SELECT session_id as sessionId
        FROM session_metadata
        WHERE LOWER(title) LIKE ?1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(`%${normalized}%`) as { sessionId: string } | null;

  return fuzzy?.sessionId
    ? buildSessionSummary(db, metadataResolver, fuzzy.sessionId, 6)
    : undefined;
}
