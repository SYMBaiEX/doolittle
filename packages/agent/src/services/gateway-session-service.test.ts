import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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

  it("keeps home routes isolated by normalized account identity", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-home-accounts-"),
    );
    const service = new GatewaySessionService(root);

    try {
      const base = {
        platform: "slack" as const,
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      };
      const personalRoot = service.resolve({
        ...base,
        metadata: { accountId: " personal " },
      });
      const personalThread = service.resolve({
        ...base,
        threadId: "thread-1",
        metadata: { accountId: "personal" },
      });
      const workRoot = service.resolve({
        ...base,
        metadata: { accountId: "work" },
      });
      const unattributed = service.resolve(base);

      service.markHome(unattributed.sessionKey);
      service.markHome(personalRoot.sessionKey);
      service.markHome(workRoot.sessionKey);

      expect(service.get(personalRoot.sessionKey)?.isHome).toBe(true);
      expect(service.get(workRoot.sessionKey)?.isHome).toBe(true);
      expect(service.get(unattributed.sessionKey)?.isHome).toBe(true);

      service.markHome(personalThread.sessionKey);

      expect(service.get(personalRoot.sessionKey)?.isHome).toBe(false);
      expect(service.get(personalThread.sessionKey)?.isHome).toBe(true);
      expect(service.get(workRoot.sessionKey)?.isHome).toBe(true);
      expect(service.get(unattributed.sessionKey)?.isHome).toBe(true);
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

  it("keeps native Telegram accounts in distinct sessions without changing legacy keys", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-telegram-accounts-"),
    );
    const service = new GatewaySessionService(root);

    try {
      const base = {
        platform: "telegram" as const,
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      };
      const first = service.resolve({
        ...base,
        metadata: { accountId: "first" },
      });
      const second = service.resolve({
        ...base,
        metadata: { accountId: "second" },
      });
      const legacy = service.resolve(base);

      expect(first.sessionKey).toBe(
        "telegram:room-1:user-1:root:account=first",
      );
      expect(second.sessionKey).toBe(
        "telegram:room-1:user-1:root:account=second",
      );
      expect(legacy.sessionKey).toBe("telegram:room-1:user-1:root");
      expect(service.list()).toHaveLength(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("isolates Slack and WhatsApp accounts and preserves account metadata across reloads", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-native-accounts-"),
    );
    const service = new GatewaySessionService(root);

    try {
      const slack = {
        platform: "slack" as const,
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      };
      const slackA = service.resolve({
        ...slack,
        metadata: { accountId: "workspace-a", nativeConnector: "slack" },
      });
      const slackB = service.resolve({
        ...slack,
        metadata: { accountId: "workspace-b", nativeConnector: "slack" },
      });
      const whatsappA = service.resolve({
        ...slack,
        platform: "whatsapp",
        metadata: { accountId: "phone-a", nativeConnector: "whatsapp" },
      });
      const whatsappB = service.resolve({
        ...slack,
        platform: "whatsapp",
        metadata: { accountId: "phone-b", nativeConnector: "whatsapp" },
      });

      expect(slackA.sessionKey).toBe(
        "slack:room-1:user-1:root:account=workspace-a",
      );
      expect(slackB.sessionKey).toBe(
        "slack:room-1:user-1:root:account=workspace-b",
      );
      expect(slackB.sessionKey).not.toBe(slackA.sessionKey);
      expect(whatsappB.sessionKey).not.toBe(whatsappA.sessionKey);

      const reloaded = new GatewaySessionService(root);
      const restored = reloaded.resolve({
        ...slack,
        metadata: {
          accountId: "workspace-a",
          reloaded: "true",
        },
      });

      expect(restored.sessionKey).toBe(slackA.sessionKey);
      expect(restored.metadata).toMatchObject({
        accountId: "workspace-a",
        nativeConnector: "slack",
        reloaded: "true",
      });
      expect(reloaded.list()).toHaveLength(4);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("encodes delimiter-bearing account IDs, bounds oversized IDs, and keeps no-account keys stable", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-account-identity-"),
    );
    const service = new GatewaySessionService(root);

    try {
      const base = {
        platform: "slack" as const,
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      };
      const delimited = service.resolve({
        ...base,
        metadata: { accountId: "workspace:a" },
      });
      const percentEncoded = service.resolve({
        ...base,
        metadata: { accountId: "workspace%3Aa" },
      });
      const longA = service.resolve({
        ...base,
        metadata: { accountId: `account-${"a".repeat(240)}` },
      });
      const longB = service.resolve({
        ...base,
        metadata: { accountId: `account-${"b".repeat(240)}` },
      });
      const unicode = service.resolve({
        ...base,
        metadata: { accountId: "🦜".repeat(120) },
      });
      const validUnicode = service.resolve({
        ...base,
        metadata: { accountId: "café" },
      });
      const loneHighSurrogate = service.resolve({
        ...base,
        metadata: { accountId: "\ud800" },
      });
      const loneLowSurrogate = service.resolve({
        ...base,
        metadata: { accountId: "\udc00" },
      });
      const loneHighSurrogateAgain = service.resolve({
        ...base,
        metadata: { accountId: "\ud800" },
      });
      const validCollisionSource = "a\u0600\0".repeat(40);
      const validCollisionBytes = Buffer.from(validCollisionSource, "utf8");
      const malformedCollisionSource = Array.from(
        { length: validCollisionBytes.length / 2 },
        (_, index) =>
          String.fromCharCode(
            (validCollisionBytes[index * 2] ?? 0) |
              ((validCollisionBytes[index * 2 + 1] ?? 0) << 8),
          ),
      ).join("");
      const validCollisionIdentity = service.resolve({
        ...base,
        metadata: { accountId: validCollisionSource },
      });
      const malformedCollisionIdentity = service.resolve({
        ...base,
        metadata: { accountId: malformedCollisionSource },
      });
      const legacy = service.resolve(base);
      const blankAccount = service.resolve({
        ...base,
        metadata: { accountId: "  " },
      });

      expect(delimited.sessionKey).toBe(
        "slack:room-1:user-1:root:account=workspace%3Aa",
      );
      expect(percentEncoded.sessionKey).toBe(
        "slack:room-1:user-1:root:account=workspace%253Aa",
      );
      expect(longA.sessionKey).not.toBe(longB.sessionKey);
      expect(longA.sessionKey.length).toBeLessThan(120);
      expect(unicode.sessionKey.length).toBeLessThan(120);
      expect(validUnicode.sessionKey).toBe(
        "slack:room-1:user-1:root:account=caf%C3%A9",
      );
      expect(loneHighSurrogate.sessionKey).toContain(
        ":account=$sha256-utf16le-",
      );
      expect(loneHighSurrogate.sessionKey.length).toBeLessThan(120);
      expect(loneHighSurrogateAgain.sessionKey).toBe(
        loneHighSurrogate.sessionKey,
      );
      expect(loneLowSurrogate.sessionKey).toContain(
        ":account=$sha256-utf16le-",
      );
      expect(loneLowSurrogate.sessionKey).not.toBe(
        loneHighSurrogate.sessionKey,
      );
      expect(validCollisionIdentity.sessionKey).toContain(":account=$sha256-");
      expect(malformedCollisionIdentity.sessionKey).toContain(
        ":account=$sha256-utf16le-",
      );
      expect(malformedCollisionIdentity.sessionKey).not.toBe(
        validCollisionIdentity.sessionKey,
      );
      expect(legacy.sessionKey).toBe("slack:room-1:user-1:root");
      expect(blankAccount.sessionKey).toBe(legacy.sessionKey);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("adopts only a matching non-Telegram legacy account route without losing its room history", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-legacy-account-"),
    );
    new GatewaySessionService(root);
    const storePath = join(root, "gateway-sessions.json");
    const legacyKey = "slack:room-1:user-1:root";
    const createdAt = "2025-01-01T00:00:00.000Z";

    try {
      writeSessionRouteStore(storePath, {
        sessions: [
          {
            sessionKey: legacyKey,
            activeAgentSessionId: "eliza-room-with-history",
            platform: "slack",
            roomId: "room-1",
            userId: "user-1",
            metadata: { accountId: "workspace-a", retained: "yes" },
            voiceMode: "all",
            voiceChannelId: "voice-1",
            voiceChannelState: "connected",
            voiceUpdatedAt: createdAt,
            voiceUpdatedReason: "voice-channel:join:voice-1",
            isHome: true,
            homeLabel: "Primary Slack",
            homeUpdatedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      });

      const reloaded = new GatewaySessionService(root);
      const adopted = reloaded.resolve({
        platform: "slack",
        roomId: "room-1",
        userId: "user-1",
        text: "hello",
        metadata: { accountId: "workspace-a", current: "yes" },
      });

      expect(adopted.sessionKey).toBe(legacyKey);
      expect(adopted).toMatchObject({
        activeAgentSessionId: "eliza-room-with-history",
        createdAt,
        voiceMode: "all",
        voiceChannelId: "voice-1",
        isHome: true,
        homeLabel: "Primary Slack",
        metadata: {
          accountId: "workspace-a",
          retained: "yes",
          current: "yes",
        },
      });
      expect(reloaded.list()).toHaveLength(1);

      const unattributed = reloaded.resolve({
        platform: "slack",
        roomId: "room-1",
        userId: "user-1",
        text: "hello without account attribution",
      });

      expect(unattributed.sessionKey).toBe(
        "slack:room-1:user-1:root:scope=unattributed",
      );
      expect(unattributed.activeAgentSessionId).toBe(unattributed.sessionKey);
      expect(unattributed.sessionKey).not.toBe(adopted.sessionKey);
      expect(reloaded.list()).toHaveLength(2);
      expect(reloaded.get(legacyKey)?.metadata).toMatchObject({
        accountId: "workspace-a",
        retained: "yes",
        current: "yes",
      });

      const repeatedUnattributed = reloaded.resolve({
        platform: "slack",
        roomId: "room-1",
        userId: "user-1",
        text: "hello without account attribution again",
      });
      expect(repeatedUnattributed.sessionKey).toBe(unattributed.sessionKey);
      expect(reloaded.list()).toHaveLength(2);

      const differentAccount = reloaded.resolve({
        platform: "slack",
        roomId: "room-1",
        userId: "user-1",
        text: "hello",
        metadata: { accountId: "workspace-b" },
      });

      expect(differentAccount.sessionKey).toBe(
        "slack:room-1:user-1:root:account=workspace-b",
      );
      expect(reloaded.list()).toHaveLength(3);
      expect(reloaded.get(legacyKey)).toMatchObject({
        activeAgentSessionId: "eliza-room-with-history",
        metadata: expect.objectContaining({
          accountId: "workspace-a",
          retained: "yes",
        }),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("adopts an exact matching legacy raw-scoped Telegram account route", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-telegram-legacy-account-"),
    );
    const storePath = join(root, "gateway-sessions.json");
    const legacyAccountId = `work:${"p".repeat(121)}`;
    const legacyKey = `telegram:room-1:user-1:root:account=${legacyAccountId}`;
    const createdAt = "2025-01-01T00:00:00.000Z";

    try {
      new GatewaySessionService(root);
      writeSessionRouteStore(storePath, {
        sessions: [
          {
            sessionKey: legacyKey,
            activeAgentSessionId: "eliza-telegram-history",
            platform: "telegram",
            roomId: "room-1",
            userId: "user-1",
            metadata: { accountId: legacyAccountId, retained: "yes" },
            voiceMode: "all",
            voiceChannelId: "voice-1",
            voiceChannelState: "connected",
            voiceUpdatedAt: createdAt,
            voiceUpdatedReason: "voice-channel:join:voice-1",
            isHome: true,
            homeLabel: "Primary Telegram",
            homeUpdatedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      });

      const reloaded = new GatewaySessionService(root);
      const adopted = reloaded.resolve({
        platform: "telegram",
        roomId: "room-1",
        userId: "user-1",
        text: "hello",
        metadata: { accountId: legacyAccountId, current: "yes" },
      });

      expect(adopted.sessionKey).toBe(legacyKey);
      expect(adopted).toMatchObject({
        activeAgentSessionId: "eliza-telegram-history",
        createdAt,
        voiceMode: "all",
        voiceChannelId: "voice-1",
        isHome: true,
        metadata: {
          accountId: legacyAccountId,
          retained: "yes",
          current: "yes",
        },
      });

      const fresh = reloaded.resolve({
        platform: "telegram",
        roomId: "room-2",
        userId: "user-1",
        text: "hello",
        metadata: { accountId: legacyAccountId },
      });

      expect(fresh.sessionKey).toContain(":account=$sha256-");
      expect(fresh.sessionKey.length).toBeLessThan(120);

      const mismatch = reloaded.resolve({
        platform: "telegram",
        roomId: "room-1",
        userId: "user-1",
        text: "hello",
        metadata: { accountId: "personal:prod" },
      });

      expect(mismatch.sessionKey).toBe(
        "telegram:room-1:user-1:root:account=personal%3Aprod",
      );
      expect(reloaded.list()).toHaveLength(3);
      expect(reloaded.get(legacyKey)).toMatchObject({
        activeAgentSessionId: "eliza-telegram-history",
        metadata: expect.objectContaining({
          accountId: legacyAccountId,
          retained: "yes",
        }),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps ordinary Telegram replies in the root session but isolates forum topics", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-gateway-sessions-telegram-topics-"),
    );
    const service = new GatewaySessionService(root);

    try {
      const message = {
        platform: "telegram" as const,
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
        metadata: { accountId: "work" },
      };
      const rootSession = service.resolve(message);
      const ordinaryReply = service.resolve({
        ...message,
        replyToMessageId: "11",
      });
      const topic = service.resolve({
        ...message,
        threadId: "81",
        replyToMessageId: "11",
      });

      expect(ordinaryReply.sessionKey).toBe(rootSession.sessionKey);
      expect(topic.sessionKey).toBe("telegram:room-1:user-1:81:account=work");
      expect(service.list()).toHaveLength(2);
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
