import type { Database } from "bun:sqlite";
import type {
  SessionSearchResult,
  SessionSummary,
  SessionUsageSummary,
} from "@/types";

export interface SessionMetadataResolver {
  metadata(sessionId: string):
    | {
        title?: string;
        continuityKey?: string;
      }
    | undefined;
  continuityKeyFor(sessionId: string): string;
}

interface SessionListRow {
  sessionId: string;
  messageCount: number;
  startedAt?: string;
  endedAt?: string;
}

interface SessionUsageRow {
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

interface MessageSummaryRow {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

/** Read-only helpers extracted from SessionService's session summary/usage surface. */
export class SessionReadSummaryHelpers {
  constructor(
    private readonly db: Database,
    private readonly metadataResolver: SessionMetadataResolver,
  ) {}

  summary(limit = 10): {
    totalSessions: number;
    recentSessionIds: string[];
  } {
    const total = this.db
      .query(
        `
          SELECT COUNT(DISTINCT session_id) as count
          FROM messages
        `,
      )
      .get() as { count: number };
    const recent = this.db
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
      recentSessionIds: recent.map((session) => session.sessionId),
    };
  }

  summarize(sessionId: string, limit = 12): SessionSummary {
    const rows = this.db
      .query(
        `
          SELECT session_id as sessionId, created_at as createdAt, role, text
          FROM messages
          WHERE session_id = ?1
          ORDER BY created_at ASC
          LIMIT ?2
        `,
      )
      .all(sessionId, limit) as MessageSummaryRow[];

    const metadata = this.metadataResolver.metadata(sessionId);

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

    const total = this.db
      .query(
        `
          SELECT COUNT(*) as count
          FROM messages
          WHERE session_id = ?1
        `,
      )
      .get(sessionId) as { count: number };

    return {
      sessionId,
      title: metadata?.title,
      continuityKey: metadata?.continuityKey,
      messageCount: total.count,
      startedAt: rows[0]?.createdAt,
      endedAt: rows.at(-1)?.createdAt,
      participants: Array.from(new Set(rows.map((row) => row.role))),
      preview: rows.map((row) => `[${row.role}] ${row.text.slice(0, 200)}`),
    };
  }

  listSessions(limit: number): SessionSummary[] {
    const rows = this.db
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
      .all(limit) as SessionListRow[];

    return rows.map((row) => {
      const summary = this.summarize(row.sessionId, 6);
      return {
        ...summary,
        messageCount: row.messageCount,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
      };
    });
  }

  listTitled(limit: number): SessionSummary[] {
    const rows = this.db
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
    return rows.map((row) => this.summarize(row.sessionId, 6));
  }

  resolveByTitle(query: string): SessionSummary | undefined {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    const exact = this.db
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
      return this.summarize(exact.sessionId, 6);
    }
    const fuzzy = this.db
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
    return fuzzy?.sessionId ? this.summarize(fuzzy.sessionId, 6) : undefined;
  }

  usage(sessionId: string): SessionUsageSummary {
    const rows = this.db
      .query(
        `
          SELECT created_at as createdAt, role, text
          FROM messages
          WHERE session_id = ?1
          ORDER BY created_at ASC
        `,
      )
      .all(sessionId) as SessionUsageRow[];

    const metadata = this.metadataResolver.metadata(sessionId);
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

  continuity(sessionId: string, limit = 20): SessionSummary[] {
    const continuityKey = this.metadataResolver.continuityKeyFor(sessionId);
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
    return rows.map((row) => this.summarize(row.sessionId, 6));
  }
}
