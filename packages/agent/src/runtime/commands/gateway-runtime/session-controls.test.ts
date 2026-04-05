import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import { handleGatewaySessionControlCommand } from "./session-controls";

function createInput(message: string): ChatTurnRequest {
  return {
    message,
    userId: "user-1",
    roomId: "discord:room-1:user-1:root",
    source: "discord",
  };
}

describe("gateway runtime command session controls", () => {
  it("manages voice state and home markers", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const context = {
      services: {
        gatewaySessions: {
          get: () => ({
            sessionKey: "discord:room-1:user-1:root",
            platform: "discord",
            roomId: "room-1",
            voiceMode: "off",
            voiceChannelId: null,
            voiceChannelState: "disconnected",
          }),
          setVoiceMode: (sessionKey: string, mode: string) => {
            calls.push({ sessionKey, mode });
            return { sessionKey, mode };
          },
          setVoiceChannel: (sessionKey: string, roomId?: string) => {
            calls.push({ sessionKey, roomId: roomId ?? null });
            return { sessionKey, roomId: roomId ?? null };
          },
          markHome: (
            sessionKey: string,
            payload: { isHome: boolean; label: string },
          ) => {
            calls.push({ sessionKey, ...payload });
            return { sessionKey, ...payload };
          },
          expireOlderThan: (minutes: number) => minutes,
        },
      },
    } as unknown as AgentExecutionContext;

    expect(
      await handleGatewaySessionControlCommand(
        createInput("/voice on"),
        "/voice on",
        "discord:room-1:user-1:root",
        context,
      ),
    ).toContain('"mode": "voice_only"');
    expect(
      await handleGatewaySessionControlCommand(
        createInput("/voice join"),
        "/voice join",
        "discord:room-1:user-1:root",
        context,
      ),
    ).toContain('"roomId": "discord:room-1:user-1:root"');
    expect(
      await handleGatewaySessionControlCommand(
        createInput("/sethome"),
        "/sethome",
        "discord:room-1:user-1:root",
        context,
      ),
    ).toContain('"label": "discord home"');
    expect(
      await handleGatewaySessionControlCommand(
        createInput("/sessions gateway expire 15"),
        "/sessions gateway expire 15",
        "discord:room-1:user-1:root",
        context,
      ),
    ).toContain('"expired": 15');

    expect(calls).toEqual([
      { sessionKey: "discord:room-1:user-1:root", mode: "voice_only" },
      {
        sessionKey: "discord:room-1:user-1:root",
        roomId: "discord:room-1:user-1:root",
      },
      {
        sessionKey: "discord:room-1:user-1:root",
        isHome: true,
        label: "discord home",
      },
    ]);
  });
});
