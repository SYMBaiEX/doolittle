import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import { handleGatewayRuntimeCommand } from ".";

function createInput(message: string): ChatTurnRequest {
  return {
    message,
    userId: "user-1",
    roomId: "discord:room-1:user-1:root",
    source: "discord",
  };
}

describe("gateway runtime command router", () => {
  it("manages voice session controls and home markers", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const context = {
      runtime: {},
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

    const voice = await handleGatewayRuntimeCommand(
      createInput("/voice on"),
      "/voice on",
      "discord:room-1:user-1:root",
      context,
    );
    const channel = await handleGatewayRuntimeCommand(
      createInput("/voice join"),
      "/voice join",
      "discord:room-1:user-1:root",
      context,
    );
    const home = await handleGatewayRuntimeCommand(
      createInput("/sethome"),
      "/sethome",
      "discord:room-1:user-1:root",
      context,
    );
    const expire = await handleGatewayRuntimeCommand(
      createInput("/sessions gateway expire 15"),
      "/sessions gateway expire 15",
      "discord:room-1:user-1:root",
      context,
    );

    expect(voice).toContain("Mode: voice_only");
    expect(channel).toContain("Channel: discord:room-1:user-1:root");
    expect(home).toContain("Label: discord home");
    expect(expire).toContain("Expired: 15");
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

  it("renders gateway history without touching transport-heavy helpers", async () => {
    const context = {
      runtime: {},
      services: {
        gatewaySessions: {},
      },
      gateway: {
        history: async () => ({
          deliveries: [{ id: "delivery-1", text: "hello" }],
        }),
      },
    } as unknown as AgentExecutionContext;

    const history = await handleGatewayRuntimeCommand(
      createInput("/gateway history"),
      "/gateway history",
      "discord:room-1:user-1:root",
      context,
    );

    expect(history).toContain("Gateway History");
    expect(history).toContain("Latest delivery: delivery-1");
  });
});
