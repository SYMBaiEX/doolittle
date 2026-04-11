import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import type { PlatformName } from "@/types";

export async function handleGatewaySessionRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/sessions/gateway") {
    const sessionKey = url.searchParams.get("sessionKey");
    if (sessionKey) {
      const session = context.services.gatewaySessions.get(sessionKey);
      if (!session) {
        return json({ error: "session not found" }, 404);
      }
      return json({ session });
    }
    return json({
      sessions: context.services.gatewaySessions.list(),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/sessions/gateway/expire"
  ) {
    const body = (await request.json()) as {
      minutes?: number;
    };
    const minutes = Number(body.minutes ?? 0);
    if (Number.isNaN(minutes) || minutes <= 0) {
      return json({ error: "minutes must be a positive number" }, 400);
    }
    return json({
      expired: context.services.gatewaySessions.expireOlderThan(minutes),
    });
  }

  if (request.method === "GET" && url.pathname === "/sessions/gateway/home") {
    const platform = url.searchParams.get("platform") as PlatformName | null;
    if (!platform) {
      return json({ error: "platform is required" }, 400);
    }
    return json({
      sessions: context.services.gatewaySessions.homeForPlatform(platform),
    });
  }

  if (request.method === "GET" && url.pathname === "/sessions/gateway/voice") {
    const sessionKey = url.searchParams.get("sessionKey");
    if (!sessionKey) {
      return json({ error: "sessionKey is required" }, 400);
    }
    const session = context.services.gatewaySessions.get(sessionKey);
    if (!session) {
      return json({ error: "session not found" }, 404);
    }
    return json({ session });
  }

  if (request.method === "POST" && url.pathname === "/sessions/gateway/voice") {
    const body = (await request.json()) as {
      sessionKey?: string;
      mode?: "off" | "voice_only" | "all";
      voiceChannelId?: string;
    };
    if (!body.sessionKey) {
      return json({ error: "sessionKey is required" }, 400);
    }
    let session = context.services.gatewaySessions.get(body.sessionKey);
    if (!session) {
      return json({ error: "session not found" }, 404);
    }
    if (body.mode) {
      session = context.services.gatewaySessions.setVoiceMode(
        body.sessionKey,
        body.mode,
      );
    }
    if (body.voiceChannelId !== undefined) {
      session = context.services.gatewaySessions.setVoiceChannel(
        body.sessionKey,
        body.voiceChannelId || undefined,
      );
    }
    return json({ session });
  }

  if (request.method === "POST" && url.pathname === "/sessions/gateway/home") {
    const body = (await request.json()) as {
      sessionKey?: string;
      isHome?: boolean;
      label?: string;
    };
    if (!body.sessionKey) {
      return json({ error: "sessionKey is required" }, 400);
    }
    return json({
      session: context.services.gatewaySessions.markHome(body.sessionKey, {
        isHome: body.isHome,
        label: body.label,
      }),
    });
  }

  return null;
}
