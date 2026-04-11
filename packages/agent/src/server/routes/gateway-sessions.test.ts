import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleGatewaySessionRoutes } from "@/server/routes/gateway-sessions";

function createContext() {
  return {
    services: {
      gatewaySessions: {
        list: () => [{ sessionKey: "telegram:room:user:root" }],
        get: (sessionKey: string) =>
          sessionKey === "telegram:room:user:root"
            ? {
                sessionKey,
                voiceMode: "off",
                voiceChannelState: "disconnected",
              }
            : undefined,
        expireOlderThan: (minutes: number) => [
          { sessionKey: `expired:${minutes}` },
        ],
        homeForPlatform: (platform: string) => [
          { sessionKey: `${platform}:home` },
        ],
        setVoiceMode: (sessionKey: string, mode: string) => ({
          sessionKey,
          voiceMode: mode,
        }),
        setVoiceChannel: (sessionKey: string, voiceChannelId?: string) => ({
          sessionKey,
          voiceChannelId,
        }),
        markHome: (
          sessionKey: string,
          options?: { isHome?: boolean; label?: string },
        ) => ({
          sessionKey,
          isHome: options?.isHome ?? true,
          label: options?.label,
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleGatewaySessionRoutes", () => {
  it("lists or resolves gateway sessions", async () => {
    const listResponse = await handleGatewaySessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/gateway"),
      new URL("http://localhost/sessions/gateway"),
    );
    const detailResponse = await handleGatewaySessionRoutes(
      createContext(),
      new Request(
        "http://localhost/sessions/gateway?sessionKey=telegram:room:user:root",
      ),
      new URL(
        "http://localhost/sessions/gateway?sessionKey=telegram:room:user:root",
      ),
    );

    await expect(listResponse?.json()).resolves.toEqual({
      sessions: [{ sessionKey: "telegram:room:user:root" }],
    });
    await expect(detailResponse?.json()).resolves.toEqual({
      session: {
        sessionKey: "telegram:room:user:root",
        voiceMode: "off",
        voiceChannelState: "disconnected",
      },
    });
  });

  it("validates expiry and home lookups", async () => {
    const expireBad = await handleGatewaySessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/gateway/expire", {
        method: "POST",
        body: JSON.stringify({ minutes: 0 }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/sessions/gateway/expire"),
    );
    const expireGood = await handleGatewaySessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/gateway/expire", {
        method: "POST",
        body: JSON.stringify({ minutes: 15 }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/sessions/gateway/expire"),
    );
    const homeBad = await handleGatewaySessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/gateway/home"),
      new URL("http://localhost/sessions/gateway/home"),
    );
    const homeGood = await handleGatewaySessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/gateway/home?platform=telegram"),
      new URL("http://localhost/sessions/gateway/home?platform=telegram"),
    );

    expect(expireBad?.status).toBe(400);
    await expect(expireGood?.json()).resolves.toEqual({
      expired: [{ sessionKey: "expired:15" }],
    });
    expect(homeBad?.status).toBe(400);
    await expect(homeGood?.json()).resolves.toEqual({
      sessions: [{ sessionKey: "telegram:home" }],
    });
  });

  it("validates and updates voice or home session state", async () => {
    const voiceBad = await handleGatewaySessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/gateway/voice", {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/sessions/gateway/voice"),
    );
    const voiceGood = await handleGatewaySessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/gateway/voice", {
        method: "POST",
        body: JSON.stringify({
          sessionKey: "telegram:room:user:root",
          voiceChannelId: "voice-1",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/sessions/gateway/voice"),
    );
    const homeGood = await handleGatewaySessionRoutes(
      createContext(),
      new Request("http://localhost/sessions/gateway/home", {
        method: "POST",
        body: JSON.stringify({
          sessionKey: "telegram:room:user:root",
          isHome: true,
          label: "Desk",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/sessions/gateway/home"),
    );

    expect(voiceBad?.status).toBe(400);
    await expect(voiceGood?.json()).resolves.toEqual({
      session: {
        sessionKey: "telegram:room:user:root",
        voiceChannelId: "voice-1",
      },
    });
    await expect(homeGood?.json()).resolves.toEqual({
      session: {
        sessionKey: "telegram:room:user:root",
        isHome: true,
        label: "Desk",
      },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleGatewaySessionRoutes(
      createContext(),
      new Request("http://localhost/not-gateway-sessions"),
      new URL("http://localhost/not-gateway-sessions"),
    );

    expect(response).toBeNull();
  });
});
