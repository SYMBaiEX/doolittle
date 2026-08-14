import type { AppContext } from "@/runtime/bootstrap";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";
import {
  normalizeGatewayReason,
  resolveGatewayPlatformSelection,
} from "./selection";

type ParsedBody = { body: Record<string, unknown> } | { response: Response };

async function readBody(request: Request): Promise<ParsedBody> {
  const parsed = await readJsonObjectBody(request);
  if (parsed.ok) return { body: parsed.value };
  return {
    response: json(
      {
        error:
          parsed.reason === "invalid_json"
            ? "Invalid JSON body"
            : "JSON body must be an object",
      },
      400,
    ),
  };
}

export async function handleGatewayControlRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/gateway/start") {
    await context.gateway.start();
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/gateway/stop") {
    await context.gateway.stop();
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/gateway/watchdog") {
    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
      reason?: string;
    };
    const reason = normalizeGatewayReason(body.reason);
    return json({
      reason,
      records: await context.gateway.watchdog(reason),
      runtime: context.gateway.runtimeStatus(),
    });
  }

  if (request.method === "POST" && url.pathname === "/gateway/watch") {
    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
      platform?: string;
      reason?: string;
    };
    const platform = resolveGatewayPlatformSelection(body.platform);
    if (!platform) {
      return json({ error: "Unknown transport platform." }, 400);
    }
    const reason = normalizeGatewayReason(body.reason);
    return json({
      platform,
      reason,
      records: await context.gateway.watch(platform, reason),
      runtime: context.gateway.runtimeStatus(),
    });
  }

  if (request.method === "POST" && url.pathname === "/gateway/restart") {
    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
      platform?: string;
      reason?: string;
    };
    const platform = resolveGatewayPlatformSelection(body.platform);
    if (!platform) {
      return json({ error: "Unknown transport platform." }, 400);
    }
    const reason = body.reason?.trim() || "api";
    return json({
      platform,
      reason,
      records: await context.gateway.restart(platform, reason),
      runtime: context.gateway.runtimeStatus(),
    });
  }

  return null;
}
