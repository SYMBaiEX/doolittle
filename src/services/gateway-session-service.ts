import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IncomingPlatformMessage, SessionRoute } from "@/types";

interface SessionRouteStore {
  sessions: SessionRoute[];
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
      message.threadId ?? "root",
    ].join(":");
    const existing = store.sessions.find((session) => session.sessionKey === sessionKey);
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      this.write(store);
      return existing;
    }

    const created: SessionRoute = {
      sessionKey,
      roomId: message.roomId,
      userId: message.userId,
      platform: message.platform,
      channelId: message.channelId,
      threadId: message.threadId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.sessions.push(created);
    this.write(store);
    return created;
  }

  list(): SessionRoute[] {
    return this.read().sessions;
  }

  expireOlderThan(minutes: number): SessionRoute[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    const store = this.read();
    const expired = store.sessions.filter(
      (session) => new Date(session.updatedAt).getTime() < cutoff,
    );
    store.sessions = store.sessions.filter(
      (session) => new Date(session.updatedAt).getTime() >= cutoff,
    );
    this.write(store);
    return expired;
  }

  private read(): SessionRouteStore {
    const raw = readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as SessionRouteStore;
  }

  private write(store: SessionRouteStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
