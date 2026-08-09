import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import type { PlatformName } from "@/types";
import { hasAsciiControlCharacters } from "@/utils/text-validation";

const PAIRING_PLATFORMS = new Set<PlatformName>([
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "email",
  "sms",
  "mattermost",
  "homeassistant",
  "dingtalk",
]);
const PAIRING_CODE = /^[A-HJ-NP-Z2-9]{8}$/u;
const DEFAULT_PAIRING_LIMIT = 200;
const MAX_PAIRING_LIMIT = 500;

function pairingPlatform(value: string | null): PlatformName | null {
  return value && PAIRING_PLATFORMS.has(value as PlatformName)
    ? (value as PlatformName)
    : null;
}

function pairingListQuery(
  url: URL,
): { platform?: PlatformName; limit: number } | { error: string } {
  if (
    [...url.searchParams.keys()].some(
      (key) => key !== "platform" && key !== "limit",
    ) ||
    url.searchParams.getAll("platform").length > 1 ||
    url.searchParams.getAll("limit").length > 1
  ) {
    return { error: "Unsupported pairing query." };
  }
  const requestedPlatform = url.searchParams.get("platform");
  const platform = requestedPlatform
    ? pairingPlatform(requestedPlatform)
    : null;
  if (requestedPlatform && !platform) {
    return { error: "Unsupported pairing platform." };
  }
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? DEFAULT_PAIRING_LIMIT : Number(rawLimit);
  if (
    (rawLimit !== null && !/^\d+$/u.test(rawLimit)) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAIRING_LIMIT
  ) {
    return { error: "Pairing limit must be an integer from 1 to 500." };
  }
  return { platform: platform ?? undefined, limit };
}

async function pairingBody(
  request: Request,
  fields: readonly ("code" | "userId")[],
): Promise<{ platform: PlatformName; code?: string; userId?: string } | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const allowed = new Set(["platform", ...fields]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  const platform =
    typeof record.platform === "string"
      ? pairingPlatform(record.platform)
      : null;
  if (!platform) return null;
  const result: { platform: PlatformName; code?: string; userId?: string } = {
    platform,
  };
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    if (
      !normalized ||
      normalized.length > 256 ||
      hasAsciiControlCharacters(normalized)
    ) {
      return null;
    }
    if (field === "code" && !PAIRING_CODE.test(normalized)) return null;
    result[field] = normalized;
  }
  return result;
}

export async function handlePairingRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/pairing/pending") {
    const query = pairingListQuery(url);
    if ("error" in query) return json({ error: query.error }, 400);
    const requests = await context.services.pairing.listPending(
      query.platform,
      query.limit + 1,
    );
    return json({
      requests: requests.slice(0, query.limit),
      truncated: requests.length > query.limit,
    });
  }

  if (request.method === "GET" && url.pathname === "/pairing/approved") {
    const query = pairingListQuery(url);
    if ("error" in query) return json({ error: query.error }, 400);
    const approved = await context.services.pairing.listApproved(
      query.platform,
      query.limit + 1,
    );
    return json({
      approved: approved.slice(0, query.limit),
      truncated: approved.length > query.limit,
    });
  }

  if (request.method === "POST" && url.pathname === "/pairing/approve") {
    const body = await pairingBody(request, ["code"]);
    if (!body?.code) return json({ error: "Invalid pairing approval." }, 400);
    return json({
      approved: await context.services.pairing.approve(
        body.platform,
        body.code,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/pairing/deny") {
    const body = await pairingBody(request, ["code"]);
    if (!body?.code) return json({ error: "Invalid pairing denial." }, 400);
    return json({
      denied: await context.services.pairing.deny(body.platform, body.code),
    });
  }

  if (request.method === "POST" && url.pathname === "/pairing/revoke") {
    const body = await pairingBody(request, ["userId"]);
    if (!body?.userId)
      return json({ error: "Invalid pairing revocation." }, 400);
    return json({
      revoked: await context.services.pairing.revoke(
        body.platform,
        body.userId,
      ),
    });
  }

  return null;
}
