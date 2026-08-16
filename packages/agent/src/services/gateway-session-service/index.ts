import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  IncomingPlatformMessage,
  PlatformName,
  SessionRoute,
} from "@/types";
import {
  createLegacyTelegramAccountSessionKey,
  createSessionKey,
  createSessionRoute,
  createUnattributedSessionKey,
  createUnscopedSessionKey,
  normalizeAccountId,
  normalizeSessionRoute,
  nowIso,
  type SessionRouteStore,
} from "./routes";
import { readSessionRouteStore, writeSessionRouteStore } from "./storage";

export class GatewaySessionService {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "gateway-sessions.json");
    writeSessionRouteStore(
      this.filePath,
      { sessions: [] },
      { ifMissing: true },
    );
  }

  resolve(message: IncomingPlatformMessage): SessionRoute {
    const store = this.read();
    const sessionKey = createSessionKey(message);
    const existing = store.sessions.find(
      (session) => session.sessionKey === sessionKey,
    );
    if (existing) {
      if (
        !normalizeAccountId(message.metadata?.accountId) &&
        normalizeAccountId(existing.metadata?.accountId)
      ) {
        const unattributedSessionKey = createUnattributedSessionKey(message);
        const unattributed = store.sessions.find(
          (session) => session.sessionKey === unattributedSessionKey,
        );
        if (unattributed) {
          this.refresh(unattributed, message);
          this.write(store);
          return normalizeSessionRoute(unattributed);
        }

        const created = createSessionRoute(message);
        created.sessionKey = unattributedSessionKey;
        created.activeAgentSessionId = unattributedSessionKey;
        store.sessions.push(created);
        this.write(store);
        return created;
      }
      this.refresh(existing, message);
      this.write(store);
      return normalizeSessionRoute(existing);
    }

    const legacy = this.matchLegacyAccountRoute(store, message);
    if (legacy) {
      // Keep the legacy session key so its Eliza room/history remains attached.
      // Only a persisted matching account ID may claim an unscoped route.
      this.refresh(legacy, message);
      this.write(store);
      return normalizeSessionRoute(legacy);
    }

    const created = createSessionRoute(message);
    store.sessions.push(created);
    this.write(store);
    return created;
  }

  list(): SessionRoute[] {
    return this.read().sessions.map(normalizeSessionRoute);
  }

  get(sessionKey: string): SessionRoute | undefined {
    return this.read()
      .sessions.map(normalizeSessionRoute)
      .find((session) => session.sessionKey === sessionKey);
  }

  setVoiceMode(
    sessionKey: string,
    mode: "off" | "voice_only" | "all",
  ): SessionRoute {
    return this.update(sessionKey, (session) => {
      session.voiceMode = mode;
      if (mode === "off" && !session.voiceChannelId) {
        session.voiceChannelState = "disconnected";
      }
      session.voiceUpdatedAt = nowIso();
      session.voiceUpdatedReason = `voice-mode:${mode}`;
    });
  }

  setVoiceChannel(sessionKey: string, channelId?: string): SessionRoute {
    return this.update(sessionKey, (session) => {
      session.voiceChannelId = channelId;
      session.voiceChannelState = channelId ? "connected" : "disconnected";
      session.voiceUpdatedAt = nowIso();
      session.voiceUpdatedReason = channelId
        ? `voice-channel:join:${channelId}`
        : "voice-channel:leave";
    });
  }

  markHome(
    sessionKey: string,
    options?: { isHome?: boolean; label?: string },
  ): SessionRoute {
    return this.update(sessionKey, (session, store) => {
      if (options?.isHome ?? true) {
        const accountId = normalizeAccountId(session.metadata?.accountId);
        for (const entry of store.sessions) {
          if (
            entry.platform === session.platform &&
            entry.userId === session.userId &&
            normalizeAccountId(entry.metadata?.accountId) === accountId
          ) {
            entry.isHome = false;
          }
        }
      }
      session.isHome = options?.isHome ?? true;
      session.homeLabel = options?.label ?? session.homeLabel;
      session.homeUpdatedAt = nowIso();
    });
  }

  inspect(sessionKey: string): SessionRoute {
    const session = this.get(sessionKey);
    if (!session) {
      throw new Error(`Gateway session not found: ${sessionKey}`);
    }
    return session;
  }

  setActiveAgentSession(
    sessionKey: string,
    activeAgentSessionId?: string,
  ): SessionRoute {
    return this.update(sessionKey, (session) => {
      session.activeAgentSessionId =
        activeAgentSessionId?.trim() || session.sessionKey;
    });
  }

  homeForPlatform(platform: PlatformName): SessionRoute[] {
    return this.list().filter(
      (session) => session.platform === platform && session.isHome,
    );
  }

  expireOlderThan(minutes: number): SessionRoute[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    const store = this.read();
    const expired = store.sessions
      .filter((session) => new Date(session.updatedAt).getTime() < cutoff)
      .map(normalizeSessionRoute);
    store.sessions = store.sessions.filter(
      (session) => new Date(session.updatedAt).getTime() >= cutoff,
    );
    this.write(store);
    return expired;
  }

  private update(
    sessionKey: string,
    mutate: (session: SessionRoute, store: SessionRouteStore) => void,
  ): SessionRoute {
    const store = this.read();
    const session = store.sessions.find(
      (candidate) => candidate.sessionKey === sessionKey,
    );
    if (!session) {
      throw new Error(`Gateway session not found: ${sessionKey}`);
    }
    mutate(session, store);
    session.updatedAt = nowIso();
    this.write(store);
    return normalizeSessionRoute(session);
  }

  private matchLegacyAccountRoute(
    store: SessionRouteStore,
    message: IncomingPlatformMessage,
  ): SessionRoute | undefined {
    const accountId = normalizeAccountId(message.metadata?.accountId);
    if (!accountId) return undefined;

    const legacySessionKey =
      message.platform === "telegram"
        ? createLegacyTelegramAccountSessionKey(message)
        : createUnscopedSessionKey(message);
    if (!legacySessionKey) return undefined;

    return store.sessions.find(
      (session) =>
        session.sessionKey === legacySessionKey &&
        session.metadata?.accountId === accountId,
    );
  }

  private refresh(
    session: SessionRoute,
    message: IncomingPlatformMessage,
  ): void {
    session.roomId = message.roomId;
    session.userId = message.userId;
    session.channelId = message.channelId ?? session.channelId;
    session.threadId = message.threadId ?? session.threadId;
    session.messageId = message.messageId ?? session.messageId;
    session.replyToMessageId =
      message.replyToMessageId ?? session.replyToMessageId;
    session.channelType = message.channelType ?? session.channelType;
    session.authorName = message.authorName ?? session.authorName;
    session.metadata = {
      ...(session.metadata ?? {}),
      ...(message.metadata ?? {}),
    };
    session.updatedAt = nowIso();
  }

  private read(): SessionRouteStore {
    return readSessionRouteStore(this.filePath);
  }

  private write(store: SessionRouteStore): void {
    writeSessionRouteStore(this.filePath, store);
  }
}
