import type { Database } from "bun:sqlite";
import type { SessionUsageSummary } from "@/types";
import type { SessionMetadataResolver } from "./types";

interface UsageRow {
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

export function resolveSessionUsage(
  db: Database,
  metadataResolver: SessionMetadataResolver,
  sessionId: string,
): SessionUsageSummary {
  const rows = db
    .query(
      `
        SELECT created_at as createdAt, role, text
        FROM messages
        WHERE session_id = ?1
        ORDER BY created_at ASC
      `,
    )
    .all(sessionId) as UsageRow[];

  const metadata = metadataResolver.metadata(sessionId);
  const characterCount = rows.reduce((sum, row) => sum + row.text.length, 0);
  const counts = rows.reduce(
    (acc, row) => {
      acc[row.role] += 1;
      return acc;
    },
    {
      user: 0,
      assistant: 0,
      system: 0,
    },
  );

  return {
    sessionId,
    title: metadata?.title,
    continuityKey: metadata?.continuityKey,
    messageCount: rows.length,
    userMessages: counts.user,
    assistantMessages: counts.assistant,
    systemMessages: counts.system,
    startedAt: rows[0]?.createdAt,
    endedAt: rows.at(-1)?.createdAt,
    characterCount,
    estimatedTokens: Math.ceil(characterCount / 4),
    lastPreview: rows.at(-1)?.text.slice(0, 200),
  };
}
