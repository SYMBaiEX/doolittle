import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  IncomingPlatformMessage,
  PlatformName,
  SessionRoute,
} from "@/types";

interface SessionRouteStore {
  sessions: SessionRoute[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function createSessionRoute(message: IncomingPlatformMessage): SessionRoute {
  return {
    sessionKey: [
      message.platform,
      message.roomId,
      message.userId,
      message.threadId ?? message.replyToMessageId ?? "root",
    ].join(":"),
    roomId: message.roomId,
    userId: message.userId,
    platform: message.platform,
    channelId: message.channelId,
    threadId: message.threadId,
    messageId: message.messageId,
    replyToMessageId: message.replyToMessageId,
    channelType: message.channelType,
    authorName: message.authorName,
    metadata: message.metadata,
    voiceMode: "off",
    voiceChannelState: "disconnected",
    voiceUpdatedAt: nowIso(),
    voiceUpdatedReason: "session-created",
    isHome: false,
    homeUpdatedAt: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeSessionRoute(route: SessionRoute): SessionRoute {
  return {
    ...route,
    voiceMode: route.voiceMode ?? "off",
    voiceChannelState: route.voiceChannelState ?? "disconnected",
    voiceUpdatedAt: route.voiceUpdatedAt ?? route.updatedAt,
    voiceUpdatedReason: route.voiceUpdatedReason ?? "session-updated",
    isHome: route.isHome ?? false,
    homeUpdatedAt: route.homeUpdatedAt ?? route.updatedAt,
  };
}

export class GatewaySessionService {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "gateway-sessions.json");
    if (!existsSync(this.filePath)) {
      this.write({ sessions: [] });
    }
  }

  resolve(message: IncomingPlatformMessage): SessionRoute {
    const store = this.read();
    const sessionKey = [
      message.platform,
      message.roomId,
      message.userId,
      message.threadId ?? message.replyToMessageId ?? "root",
    ].join(":");
    const existing = store.sessions.find(
      (session) => session.sessionKey === sessionKey,
    );
    if (existing) {
      existing.roomId = message.roomId;
      existing.userId = message.userId;
      existing.channelId = message.channelId ?? existing.channelId;
      existing.threadId = message.threadId ?? existing.threadId;
      existing.messageId = message.messageId ?? existing.messageId;
      existing.replyToMessageId =
        message.replyToMessageId ?? existing.replyToMessageId;
      existing.channelType = message.channelType ?? existing.channelType;
      existing.authorName = message.authorName ?? existing.authorName;
      existing.metadata = {
        ...(existing.metadata ?? {}),
        ...(message.metadata ?? {}),
      };
      existing.updatedAt = nowIso();
      this.write(store);
      return normalizeSessionRoute(existing);
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
        for (const entry of store.sessions) {
          if (
            entry.platform === session.platform &&
            entry.userId === session.userId
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

  private read(): SessionRouteStore {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as SessionRouteStore;
    return {
      sessions: (parsed.sessions ?? []).map(normalizeSessionRoute),
    };
  }

  private write(store: SessionRouteStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
