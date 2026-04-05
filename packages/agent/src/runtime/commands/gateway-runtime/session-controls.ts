import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";

export async function handleGatewaySessionControlCommand(
  input: ChatTurnRequest,
  trimmed: string,
  sessionKey: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/voice" || trimmed === "/voice status") {
    const session = context.services.gatewaySessions.get(sessionKey);
    if (!session) {
      return "No active gateway session is attached to this conversation yet.";
    }
    return JSON.stringify(
      {
        sessionKey: session.sessionKey,
        platform: session.platform,
        roomId: session.roomId,
        voiceMode: session.voiceMode ?? "off",
        voiceChannelId: session.voiceChannelId ?? null,
        voiceChannelState: session.voiceChannelState ?? "disconnected",
        voiceUpdatedAt: session.voiceUpdatedAt ?? null,
        voiceUpdatedReason: session.voiceUpdatedReason ?? null,
        isHome: session.isHome ?? false,
        homeLabel: session.homeLabel ?? null,
        homeUpdatedAt: session.homeUpdatedAt ?? null,
      },
      null,
      2,
    );
  }

  if (trimmed === "/voice on") {
    return JSON.stringify(
      context.services.gatewaySessions.setVoiceMode(sessionKey, "voice_only"),
      null,
      2,
    );
  }

  if (trimmed === "/voice off") {
    return JSON.stringify(
      context.services.gatewaySessions.setVoiceMode(sessionKey, "off"),
      null,
      2,
    );
  }

  if (trimmed === "/voice tts") {
    return JSON.stringify(
      context.services.gatewaySessions.setVoiceMode(sessionKey, "all"),
      null,
      2,
    );
  }

  if (trimmed === "/voice join" || trimmed === "/voice channel") {
    return JSON.stringify(
      context.services.gatewaySessions.setVoiceChannel(
        sessionKey,
        input.roomId ?? sessionKey,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/voice leave") {
    return JSON.stringify(
      context.services.gatewaySessions.setVoiceChannel(sessionKey, undefined),
      null,
      2,
    );
  }

  if (trimmed === "/sethome") {
    return JSON.stringify(
      context.services.gatewaySessions.markHome(sessionKey, {
        isHome: true,
        label: input.source ? `${input.source} home` : "home",
      }),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/sessions gateway expire ")) {
    const value = Number(
      trimmed.replace("/sessions gateway expire ", "").trim(),
    );
    if (Number.isNaN(value) || value <= 0) {
      return "Usage: /sessions gateway expire <minutes>";
    }
    return JSON.stringify(
      {
        expired: context.services.gatewaySessions.expireOlderThan(value),
      },
      null,
      2,
    );
  }

  return undefined;
}
