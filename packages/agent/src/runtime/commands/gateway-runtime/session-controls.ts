import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import { renderGatewayOperatorBlock } from "./readouts/shared";

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
    return renderGatewayOperatorBlock(
      "Voice Session",
      [
        `Session: ${session.sessionKey}`,
        `Platform: ${session.platform} room=${session.roomId}`,
        `Voice mode: ${session.voiceMode ?? "off"}`,
        `Channel: ${session.voiceChannelId ?? "none"} state=${session.voiceChannelState ?? "disconnected"}`,
        `Home: ${session.isHome ? "yes" : "no"}${session.homeLabel ? ` (${session.homeLabel})` : ""}`,
      ],
      [
        "Use `/voice on`, `/voice off`, or `/voice tts` to change delivery mode.",
      ],
    );
  }

  if (trimmed === "/voice on") {
    context.services.gatewaySessions.setVoiceMode(sessionKey, "voice_only");
    return renderGatewayOperatorBlock(
      "Voice Session Updated",
      [`Session: ${sessionKey}`, "Mode: voice_only"],
      ["Use `/voice status` to confirm the active voice route."],
    );
  }

  if (trimmed === "/voice off") {
    context.services.gatewaySessions.setVoiceMode(sessionKey, "off");
    return renderGatewayOperatorBlock(
      "Voice Session Updated",
      [`Session: ${sessionKey}`, "Mode: off"],
      ["Use `/voice status` to confirm the session is back to text-only."],
    );
  }

  if (trimmed === "/voice tts") {
    context.services.gatewaySessions.setVoiceMode(sessionKey, "all");
    return renderGatewayOperatorBlock(
      "Voice Session Updated",
      [`Session: ${sessionKey}`, "Mode: all"],
      ["Use `/voice status` to confirm voice + text delivery mode."],
    );
  }

  if (trimmed === "/voice join" || trimmed === "/voice channel") {
    const roomId = input.roomId ?? sessionKey;
    context.services.gatewaySessions.setVoiceChannel(sessionKey, roomId);
    return renderGatewayOperatorBlock(
      "Voice Channel Updated",
      [`Session: ${sessionKey}`, `Channel: ${roomId}`],
      ["Use `/voice status` to confirm the connected voice channel."],
    );
  }

  if (trimmed === "/voice leave") {
    context.services.gatewaySessions.setVoiceChannel(sessionKey, undefined);
    return renderGatewayOperatorBlock(
      "Voice Channel Updated",
      [`Session: ${sessionKey}`, "Channel: disconnected"],
      ["Use `/voice status` if you want to verify the session state."],
    );
  }

  if (trimmed === "/sethome") {
    const label = input.source ? `${input.source} home` : "home";
    context.services.gatewaySessions.markHome(sessionKey, {
      isHome: true,
      label,
    });
    return renderGatewayOperatorBlock(
      "Gateway Home Updated",
      [`Session: ${sessionKey}`, `Label: ${label}`],
      ["Use `/voice status` to see the current home-session binding."],
    );
  }

  if (trimmed.startsWith("/sessions gateway expire ")) {
    const value = Number(
      trimmed.replace("/sessions gateway expire ", "").trim(),
    );
    if (Number.isNaN(value) || value <= 0) {
      return "Usage: /sessions gateway expire <minutes>";
    }
    const expired = context.services.gatewaySessions.expireOlderThan(value);
    return renderGatewayOperatorBlock(
      "Gateway Sessions Expired",
      [`Window: older than ${value} minute(s)`, `Expired: ${expired}`],
      [
        "Run `/voice status` in an active conversation if you need to recreate session bindings.",
      ],
    );
  }

  return undefined;
}
