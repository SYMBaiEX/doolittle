import type { AppContext } from "@/runtime/bootstrap";
import { getEffectiveDelegationTasks } from "@/runtime/native/service-bridge/delegation";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { json } from "@/server/responses";
import {
  ACTIVITY_FEED_MAX_LIMIT,
  type ActivityEventKind,
  type ActivityEventStatus,
  type ActivityEventTarget,
  type ActivityFeedFilters,
  buildActivityExport,
  buildActivityFeed,
  decodeActivityCursor,
} from "@/services/activity-feed";
import { hasAsciiControlCharacters } from "@/utils/text-validation";

const ACTIVITY_QUERY_KEYS = new Set([
  "limit",
  "after",
  "kind",
  "status",
  "target",
  "sessionId",
]);

function hasInvalidActivityQuery(url: URL): boolean {
  return (
    [...url.searchParams.keys()].some((key) => !ACTIVITY_QUERY_KEYS.has(key)) ||
    [...ACTIVITY_QUERY_KEYS].some(
      (key) => url.searchParams.getAll(key).length > 1,
    )
  );
}

function parseLimit(value: string | null): number | Response {
  if (value === null) return 50;
  const limit = Number(value);
  return Number.isInteger(limit) &&
    limit > 0 &&
    limit <= ACTIVITY_FEED_MAX_LIMIT
    ? limit
    : json(
        {
          error: `limit must be an integer from 1 to ${ACTIVITY_FEED_MAX_LIMIT}`,
        },
        400,
      );
}

function parseEnum<T extends string>(
  value: string | null,
  values: readonly T[],
  name: string,
): T | undefined | Response {
  if (value === null || !value.trim()) return undefined;
  return (values as readonly string[]).includes(value)
    ? (value as T)
    : json({ error: `${name} is invalid` }, 400);
}

function parseFilters(url: URL): ActivityFeedFilters | Response {
  const kind = parseEnum<ActivityEventKind>(
    url.searchParams.get("kind"),
    [
      "chat-run",
      "automation",
      "delegation",
      "approval",
      "delivery",
      "terminal",
      "repository-change",
      "codegen",
      "log",
    ],
    "kind",
  );
  if (kind instanceof Response) return kind;
  const status = parseEnum<ActivityEventStatus>(
    url.searchParams.get("status"),
    [
      "pending",
      "running",
      "succeeded",
      "failed",
      "cancelled",
      "skipped",
      "approved",
      "denied",
      "expired",
      "used",
      "delivered",
      "recorded",
    ],
    "status",
  );
  if (status instanceof Response) return status;
  const target = parseEnum<ActivityEventTarget>(
    url.searchParams.get("target"),
    [
      "chat",
      "review",
      "automations",
      "orchestration",
      "terminal",
      "workspace",
      "codegen",
      "operations",
    ],
    "target",
  );
  if (target instanceof Response) return target;
  const sessionId = url.searchParams.get("sessionId")?.trim();
  if (
    sessionId &&
    (sessionId.length > 256 || hasAsciiControlCharacters(sessionId))
  ) {
    return json({ error: "sessionId is invalid" }, 400);
  }
  return { kind, status, target, ...(sessionId ? { sessionId } : {}) };
}

export async function handleActivityRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const isFeed = url.pathname === "/activity";
  const isExport = url.pathname === "/activity/export";
  if (!isFeed && !isExport) return null;
  if (request.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }
  if (hasInvalidActivityQuery(url)) {
    return json({ error: "unsupported or repeated activity query" }, 400);
  }
  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit instanceof Response) return limit;
  const after = url.searchParams.get("after")?.trim() || undefined;
  if (after && (after.length > 1_024 || !decodeActivityCursor(after))) {
    return json({ error: "after cursor is invalid" }, 400);
  }
  const filters = parseFilters(url);
  if (filters instanceof Response) return filters;
  const cron = getNativeServices(context.runtime).automation;
  if (!cron) {
    return json({ error: "Trigger runtime service is not ready." }, 503);
  }
  const [automationRuns, delegationTasks, repositoryChanges] =
    await Promise.all([
      cron.runs(ACTIVITY_FEED_MAX_LIMIT),
      getEffectiveDelegationTasks(context.runtime),
      context.services.repository.changes(),
    ]);
  const feed = buildActivityFeed(
    context.services,
    { limit, after, filters },
    {
      automationRuns,
      delegationTasks,
      repositoryChanges,
      repositoryObservedAt: new Date().toISOString(),
    },
  );
  return json(isExport ? buildActivityExport(feed) : feed);
}
