import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSessionRouteStore } from "@/services/gateway-session-service/storage";
import type { SessionRoute } from "@/types/gateway";
import { GatewaySessionService } from "./gateway-session-service";

function withUpdatedAt(route: SessionRoute, updatedAt: string): SessionRoute {
  return {
    ...route,
    updatedAt,
  };
}

describe("GatewaySessionService", () => {
  it("tracks voice mode and home channel state on sessions", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-sessions-"));
    const service = new GatewaySessionService(root);

    try {
      const session = service.resolve({
        platform: "telegram",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      });

      const voiceOnly = service.setVoiceMode(session.sessionKey, "voice_only");
      expect(voiceOnly.voiceMode).toBe("voice_only");
      expect(voiceOnly.voiceUpdatedAt).toBeDefined();
      expect(voiceOnly.voiceUpdatedReason).toBe("voice-mode:voice_only");

      const joined = service.setVoiceChannel(
        session.sessionKey,
        "voice-room-1",
      );
      expect(joined.voiceChannelId).toBe("voice-room-1");
      expect(joined.voiceChannelState).toBe("connected");
      expect(joined.voiceUpdatedReason).toBe("voice-channel:join:voice-room-1");

      const home = service.markHome(session.sessionKey, {
        isHome: true,
        label: "Primary Telegram",
      });
      expect(home.isHome).toBe(true);
      expect(home.homeLabel).toBe("Primary Telegram");
      expect(home.homeUpdatedAt).toBeDefined();

      const homes = service.homeForPlatform("telegram");
      expect(homes).toHaveLength(1);
      expect(homes[0]?.sessionKey).toBe(session.sessionKey);

      const left = service.setVoiceChannel(session.sessionKey);
      expect(left.voiceChannelState).toBe("disconnected");
      expect(left.voiceUpdatedReason).toBe("voice-channel:leave");
      expect(service.inspect(session.sessionKey).sessionKey).toBe(
        session.sessionKey,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reuses an existing session route and merges metadata on repeated resolve", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-resolve-"),
    );
    const service = new GatewaySessionService(root);

    try {
      const first = service.resolve({
        platform: "api",
        userId: "user-2",
        roomId: "room-2",
        text: "initial",
        metadata: {
          source: "api",
        },
      });

      const second = service.resolve({
        platform: "api",
        userId: "user-2",
        roomId: "room-2",
        text: "follow-up",
        metadata: {
          tone: "warm",
        },
      });

      expect(second.sessionKey).toBe(first.sessionKey);
      expect(second.metadata).toMatchObject({
        source: "api",
        tone: "warm",
      });
      expect(second.updatedAt >= first.updatedAt).toBe(true);
      expect(service.list()).toHaveLength(1);
      expect(service.get(first.sessionKey)?.metadata).toMatchObject({
        source: "api",
        tone: "warm",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("throws on updates to non-existent sessions and does not create files unexpectedly", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-missing-"),
    );
    const service = new GatewaySessionService(root);

    try {
      const missing = "missing-session";
      expect(() => service.get(missing)).not.toThrow();
      expect(() => service.setVoiceMode(missing, "off")).toThrow(
        `Gateway session not found: ${missing}`,
      );
      expect(() => service.setVoiceChannel(missing, "room-1")).toThrow(
        `Gateway session not found: ${missing}`,
      );
      expect(() => service.markHome(missing)).toThrow(
        `Gateway session not found: ${missing}`,
      );
      expect(() => service.setActiveAgentSession(missing)).toThrow(
        `Gateway session not found: ${missing}`,
      );
      expect(service.expireOlderThan(1)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("expires stale sessions and keeps fresh sessions in store", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-expire-"),
    );
    const service = new GatewaySessionService(root);
    const storePath = join(root, "gateway-sessions.json");

    try {
      const now = Date.now();
      const staleMessage = {
        platform: "api",
        userId: "user-stale",
        roomId: "room-stale",
        text: "old",
      } as const;
      const freshMessage = {
        platform: "api",
        userId: "user-fresh",
        roomId: "room-fresh",
        text: "new",
      } as const;
      const stale = service.resolve(staleMessage);
      const fresh = service.resolve(freshMessage);
      const staleSession = service.get(stale.sessionKey);
      const freshSession = service.get(fresh.sessionKey);

      expect(staleSession).toBeDefined();
      expect(freshSession).toBeDefined();
      if (!staleSession || !freshSession) {
        throw new Error("Expected seeded sessions to exist");
      }

      writeSessionRouteStore(storePath, {
        sessions: [
          withUpdatedAt(staleSession, new Date(now - 5 * 60_000).toISOString()),
          withUpdatedAt(freshSession, new Date(now - 30_000).toISOString()),
        ],
      });

      const expired = service.expireOlderThan(1);
      expect(expired).toHaveLength(1);
      expect(expired[0]?.sessionKey).toBe(stale.sessionKey);
      expect(service.get(stale.sessionKey)).toBeUndefined();
      expect(service.list().map((entry) => entry.sessionKey)).toEqual([
        fresh.sessionKey,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
