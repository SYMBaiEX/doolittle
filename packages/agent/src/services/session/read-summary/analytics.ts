import type { SessionDatabase } from "@/services/session/database";
import type {
  SessionAnalyticsDay,
  SessionAnalyticsSnapshot,
  SessionUsageSummary,
} from "@/types";

const DEFAULT_ANALYTICS_LIMIT = 1_000;
const MAX_ANALYTICS_LIMIT = 2_000;
const DEFAULT_RECENT_LIMIT = 20;
const MAX_RECENT_LIMIT = 100;

interface SessionAnalyticsRow {
  sessionId: string;
  title: string | null;
  continuityKey: string | null;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  systemMessages: number;
  startedAt: string | null;
  endedAt: string | null;
  characterCount: number;
  lastPreview: string | null;
}

function boundedLimit(
  value: number,
  fallback: number,
  maximum: number,
): number {
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function toUsage(row: SessionAnalyticsRow): SessionUsageSummary {
  return {
    sessionId: row.sessionId,
    ...(row.title ? { title: row.title } : {}),
    ...(row.continuityKey ? { continuityKey: row.continuityKey } : {}),
    messageCount: row.messageCount,
    userMessages: row.userMessages,
    assistantMessages: row.assistantMessages,
    systemMessages: row.systemMessages,
    ...(row.startedAt ? { startedAt: row.startedAt } : {}),
    ...(row.endedAt ? { endedAt: row.endedAt } : {}),
    characterCount: row.characterCount,
    estimatedTokens: Math.ceil(row.characterCount / 4),
    ...(row.lastPreview ? { lastPreview: row.lastPreview.slice(0, 200) } : {}),
  };
}

export function resolveSessionAnalytics(
  db: SessionDatabase,
  limit = DEFAULT_ANALYTICS_LIMIT,
  recentLimit = DEFAULT_RECENT_LIMIT,
): SessionAnalyticsSnapshot {
  const rows = db
    .query(
      `
        WITH aggregate_rows AS (
          SELECT
            messages.session_id as sessionId,
            COUNT(*) as messageCount,
            COALESCE(SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END), 0)
              as userMessages,
            COALESCE(SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END), 0)
              as assistantMessages,
            COALESCE(SUM(CASE WHEN role = 'system' THEN 1 ELSE 0 END), 0)
              as systemMessages,
            MIN(created_at) as startedAt,
            MAX(created_at) as endedAt,
            COALESCE(SUM(LENGTH(text)), 0) as characterCount,
            (
              SELECT latest.text
              FROM messages latest
              WHERE latest.session_id = messages.session_id
              ORDER BY latest.created_at DESC, latest.rowid DESC
              LIMIT 1
            ) as lastPreview
          FROM messages
          GROUP BY messages.session_id
          ORDER BY endedAt DESC
          LIMIT ?1
        )
        SELECT
          aggregate_rows.*,
          session_metadata.title,
          session_metadata.continuity_key as continuityKey
        FROM aggregate_rows
        LEFT JOIN session_metadata
          ON session_metadata.session_id = aggregate_rows.sessionId
        ORDER BY aggregate_rows.endedAt DESC
      `,
    )
    .all(
      boundedLimit(limit, DEFAULT_ANALYTICS_LIMIT, MAX_ANALYTICS_LIMIT),
    ) as SessionAnalyticsRow[];

  const sessions = rows.map(toUsage);
  const totals = sessions.reduce(
    (result, session) => {
      result.messages += session.messageCount;
      result.estimatedTokens += session.estimatedTokens;
      result.userMessages += session.userMessages;
      result.assistantMessages += session.assistantMessages;
      result.systemMessages += session.systemMessages;
      return result;
    },
    {
      sessions: sessions.length,
      messages: 0,
      estimatedTokens: 0,
      userMessages: 0,
      assistantMessages: 0,
      systemMessages: 0,
    },
  );
  const activityByDate = new Map<string, SessionAnalyticsDay>();
  for (const session of sessions) {
    const date = (session.endedAt ?? session.startedAt)?.slice(0, 10);
    if (!date) continue;
    const activity = activityByDate.get(date) ?? {
      date,
      sessions: 0,
      messages: 0,
      estimatedTokens: 0,
    };
    activity.sessions += 1;
    activity.messages += session.messageCount;
    activity.estimatedTokens += session.estimatedTokens;
    activityByDate.set(date, activity);
  }

  return {
    totals,
    recentSessions: sessions.slice(
      0,
      boundedLimit(recentLimit, DEFAULT_RECENT_LIMIT, MAX_RECENT_LIMIT),
    ),
    dailyActivity: [...activityByDate.values()]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-30),
  };
}
