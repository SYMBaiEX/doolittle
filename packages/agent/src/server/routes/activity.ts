import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import {
  ACTIVITY_FEED_MAX_LIMIT,
  buildActivityFeed,
  decodeActivityCursor,
} from "@/services/activity-feed";

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

export async function handleActivityRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (url.pathname !== "/activity") return null;
  if (request.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }
  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit instanceof Response) return limit;
  const after = url.searchParams.get("after")?.trim() || undefined;
  if (after && !decodeActivityCursor(after)) {
    return json({ error: "after cursor is invalid" }, 400);
  }
  return json(
    buildActivityFeed(context.services, {
      limit,
      after,
    }),
  );
}
