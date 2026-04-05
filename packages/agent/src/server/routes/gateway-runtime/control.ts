import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import {
  normalizeGatewayReason,
  resolveGatewayPlatformSelection,
} from "./selection";

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
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
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
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
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
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
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
