import type {
  SessionAnalyticsDay,
  SessionAnalyticsSnapshot,
  SessionUsageSummary,
} from "../../../types/index";
import type { SessionDatabase } from "../database";

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

function localActivityDate(value: string): string | undefined {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value.slice(0, 10) || undefined;
  }
  const year = timestamp.getFullYear();
  const month = `${timestamp.getMonth() + 1}`.padStart(2, "0");
  const day = `${timestamp.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveSessionAnalytics(
  db: SessionDatabase,
  limit = DEFAULT_ANALYTICS_LIMIT,
  recentLimit = DEFAULT_RECENT_LIMIT,
): SessionAnalyticsSnapshot {
  const rows = db
    .query(
      `
        SELECT
          activity.session_id as sessionId,
          activity.message_count as messageCount,
          activity.started_at as startedAt,
          activity.ended_at as endedAt,
          session_metadata.title,
          session_metadata.continuity_key as continuityKey,
          (SELECT COUNT(*) FROM messages
            WHERE session_id = activity.session_id AND role = 'user')
            as userMessages,
          (SELECT COUNT(*) FROM messages
            WHERE session_id = activity.session_id AND role = 'assistant')
            as assistantMessages,
          (SELECT COUNT(*) FROM messages
            WHERE session_id = activity.session_id AND role = 'system')
            as systemMessages,
          (SELECT COALESCE(SUM(LENGTH(text)), 0) FROM messages
            WHERE session_id = activity.session_id)
            as characterCount,
          (SELECT text FROM messages
            WHERE session_id = activity.session_id
            ORDER BY created_at DESC, rowid DESC LIMIT 1)
            as lastPreview
        FROM session_message_activity activity
        LEFT JOIN session_metadata
          ON session_metadata.session_id = activity.session_id
        ORDER BY activity.ended_at DESC, activity.session_id ASC
        LIMIT ?1
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
    const timestamp = session.endedAt ?? session.startedAt;
    const date = timestamp ? localActivityDate(timestamp) : undefined;
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
