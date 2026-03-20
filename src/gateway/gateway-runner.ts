import { loadGatewayConfig } from "@/config/gateway";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { authorizeMessage } from "./authorization";
import {
  capabilitiesForPlatform,
  nowIso,
  type PlatformLifecycleEvent,
  type PlatformAdapter,
  type PlatformHealth,
  type PlatformPresenceState,
} from "./platforms/base";
import { DiscordPlatformAdapter } from "./platforms/discord-adapter";
import { EmailPlatformAdapter } from "./platforms/email-adapter";
import { MatrixPlatformAdapter } from "./platforms/matrix-adapter";
import { MockPlatformAdapter } from "./platforms/mock-adapter";
import { SignalPlatformAdapter } from "./platforms/signal-adapter";
import { SlackPlatformAdapter } from "./platforms/slack-adapter";
import { SmsPlatformAdapter } from "./platforms/sms-adapter";
import { TelegramPlatformAdapter } from "./platforms/telegram-adapter";
import { WhatsAppPlatformAdapter } from "./platforms/whatsapp-adapter";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
  SessionRoute,
} from "@/types";

const LIGHTWEIGHT_WEBHOOK_PLATFORMS = new Set<PlatformName>([
  "signal",
  "matrix",
  "email",
  "sms",
]);

interface GatewayTraceRecord {
  traceId: string;
  at: string;
  kind:
    | "receive"
    | "authorize"
    | "session"
    | "route"
    | "respond"
    | "deliver"
    | "heartbeat"
    | "reject"
    | "lifecycle";
  platform: PlatformName | "gateway";
  detail: string;
  sessionId?: string;
  userId?: string;
  roomId?: string;
  messageId?: string;
  threadId?: string;
  replyToMessageId?: string;
  deliveryId?: string;
  metadataKeys?: string[];
}

interface GatewayHistoryFilter {
  platform?: PlatformName;
  kind?: GatewayTraceRecord["kind"];
  sessionId?: string;
}

interface GatewayPlatformState {
  platform: PlatformName;
  status: PlatformHealth["status"];
  mode: PlatformHealth["mode"];
  ready: boolean;
  detail: string;
  presence: PlatformPresenceState;
  sendCount: number;
  receiveCount: number;
  routeCount: number;
  respondCount: number;
  heartbeatCount: number;
  authorizeCount: number;
  rejectCount: number;
  lastError?: string;
  lastDeliveryAt?: string;
  lastDeliveryId?: string;
  lastOutboundRoomId?: string;
  lastOutboundUserId?: string;
  lastOutboundThreadId?: string;
  lastOutboundReplyToId?: string;
  lastOutboundMetadataKeys?: string[];
  lastReceivedAt?: string;
  lastRoutedAt?: string;
  lastRespondedAt?: string;
  lastHeartbeatAt?: string;
  lastSessionId?: string;
  lastRoomId?: string;
  lastUserId?: string;
  eventCount: number;
  lastEventAt?: string;
  lastEventKind?: PlatformLifecycleEvent["kind"];
  lastEventDetail?: string;
  traceCount: number;
  lastTraceAt?: string;
  lastTraceKind?: GatewayTraceRecord["kind"];
  lastTraceDetail?: string;
  lastUpdatedAt?: string;
}

interface GatewayHistorySnapshot {
  updatedAt: string;
  reason: string;
  snapshotPath: string;
  historyPath: string;
  readiness: PlatformHealth[];
  traces: GatewayTraceRecord[];
  deliveries: DeliveredMessageRecord[];
  sessions: SessionRoute[];
  state: GatewayStateSnapshot;
}

interface GatewayStateSnapshot {
  running: boolean;
  updatedAt: string;
  reason: string;
  heartbeatAt?: string;
  snapshotPath: string;
  historyPath: string;
  totals: {
    configuredPlatforms: number;
    activeAdapters: number;
    readyAdapters: number;
    nativeAdapters: number;
    mockAdapters: number;
    totalTraces: number;
    recentTraces: number;
    recentDeliveries: number;
    recentSessions: number;
  };
  platforms: GatewayPlatformState[];
  tracesByKind: Array<{ kind: GatewayTraceRecord["kind"]; count: number }>;
  tracesByPlatform: Array<{ platform: PlatformName | "gateway"; count: number }>;
  deliveriesByPlatform: Array<{ platform: PlatformName; count: number }>;
  sessionsByPlatform: Array<{ platform: PlatformName; count: number }>;
}

export class GatewayRunner {
  private readonly adapters = new Map<PlatformName, PlatformAdapter>();
  private readonly traceLog: GatewayTraceRecord[] = [];
  private readonly platformStates = new Map<PlatformName, GatewayPlatformState>();
  private readonly snapshotDir: string;
  private readonly snapshotPath: string;
  private readonly snapshotHistoryPath: string;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly context: AppContext) {
    this.snapshotDir = join(this.context.config.gatewayDataDir, "snapshots");
    this.snapshotPath = join(this.snapshotDir, "gateway-state.json");
    this.snapshotHistoryPath = join(this.snapshotDir, "gateway-state-history.jsonl");
    mkdirSync(this.snapshotDir, { recursive: true });
  }

  private async observeAdapter(
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter?.observe) {
      return;
    }
    await adapter.observe(event);
  }

  private ensurePlatformState(platform: PlatformName): GatewayPlatformState {
    const existing = this.platformStates.get(platform);
    if (existing) {
      return existing;
    }

    const presence: PlatformPresenceState = {
      status: "offline",
      activity: `${platform} transport idle`,
    };
    const created: GatewayPlatformState = {
      platform,
      status: "stopped",
      mode: "mock",
      ready: false,
      detail: `${platform} transport has not been initialized yet.`,
      presence,
      sendCount: 0,
      receiveCount: 0,
      routeCount: 0,
      respondCount: 0,
      heartbeatCount: 0,
      authorizeCount: 0,
      rejectCount: 0,
      eventCount: 0,
      traceCount: 0,
    };
    this.platformStates.set(platform, created);
    return created;
  }

  private snapshotPresence(
    status: PlatformPresenceState["status"],
    activity: string,
    lastHeartbeatAt?: string,
  ): PlatformPresenceState {
    return {
      status,
      activity,
      lastHeartbeatAt,
      lastPresenceChangeAt: nowIso(),
    };
  }

  private syncPlatformStateFromHealth(health: PlatformHealth): GatewayPlatformState {
    const state = this.ensurePlatformState(health.platform);
    state.status = health.status;
    state.mode = health.mode;
    state.ready = health.ready;
    state.detail = health.detail;
    state.sendCount = health.sendCount ?? state.sendCount;
    state.lastDeliveryAt = health.lastDeliveryAt ?? state.lastDeliveryAt;
    state.lastDeliveryId = health.lastDeliveryId ?? state.lastDeliveryId;
    state.lastOutboundRoomId = health.lastOutboundRoomId ?? state.lastOutboundRoomId;
    state.lastOutboundUserId = health.lastOutboundUserId ?? state.lastOutboundUserId;
    state.lastOutboundThreadId = health.lastOutboundThreadId ?? state.lastOutboundThreadId;
    state.lastOutboundReplyToId = health.lastOutboundReplyToId ?? state.lastOutboundReplyToId;
    state.lastOutboundMetadataKeys = health.lastOutboundMetadataKeys ?? state.lastOutboundMetadataKeys;
    state.lastReceivedAt = health.lastReceivedAt ?? state.lastReceivedAt;
    state.lastRoutedAt = health.lastRoutedAt ?? state.lastRoutedAt;
    state.lastRespondedAt = health.lastRespondedAt ?? state.lastRespondedAt;
    state.lastHeartbeatAt = health.lastHeartbeatAt ?? state.lastHeartbeatAt;
    state.lastError = health.lastError;
    state.presence = health.presence ?? state.presence;
    state.eventCount = health.events.length;
    state.lastEventAt = health.events[0]?.at ?? state.lastEventAt;
    state.lastEventKind = health.events[0]?.kind ?? state.lastEventKind;
    state.lastEventDetail = health.events[0]?.detail ?? state.lastEventDetail;
    state.lastUpdatedAt = nowIso();
    return state;
  }

  private updatePlatformStateFromTrace(entry: GatewayTraceRecord): void {
    if (entry.platform === "gateway") {
      return;
    }

    const state = this.ensurePlatformState(entry.platform);
    state.traceCount += 1;
    state.lastTraceAt = entry.at;
    state.lastTraceKind = entry.kind;
    state.lastTraceDetail = entry.detail;
    state.lastUpdatedAt = entry.at;
    state.lastRoomId = entry.roomId ?? state.lastRoomId;
    state.lastUserId = entry.userId ?? state.lastUserId;
    state.lastSessionId = entry.sessionId ?? state.lastSessionId;

    switch (entry.kind) {
      case "receive":
        state.receiveCount += 1;
        state.lastReceivedAt = entry.at;
        state.presence = this.snapshotPresence(
          "online",
          `Receiving traffic on ${entry.platform}`,
          entry.at,
        );
        break;
      case "authorize":
        state.authorizeCount += 1;
        state.presence = this.snapshotPresence(
          state.presence.status === "offline" ? "away" : state.presence.status,
          `Authorization in progress for ${entry.platform}`,
          state.lastHeartbeatAt,
        );
        break;
      case "session":
        state.presence = this.snapshotPresence(
          "online",
          `Session ${entry.sessionId ?? "unknown"} active on ${entry.platform}`,
          state.lastHeartbeatAt,
        );
        break;
      case "route":
        state.routeCount += 1;
        state.lastRoutedAt = entry.at;
        state.presence = this.snapshotPresence(
          "online",
          `Routing traffic for session ${entry.sessionId ?? "unknown"}`,
          state.lastHeartbeatAt,
        );
        break;
      case "respond":
        state.respondCount += 1;
        state.lastRespondedAt = entry.at;
        state.presence = this.snapshotPresence(
          "online",
          `Responding through ${entry.platform}`,
          state.lastHeartbeatAt,
        );
        break;
      case "deliver":
        state.lastDeliveryAt = entry.at;
        state.lastDeliveryId = entry.deliveryId ?? state.lastDeliveryId;
        break;
      case "heartbeat":
        state.heartbeatCount += 1;
        state.lastHeartbeatAt = entry.at;
        state.presence = this.snapshotPresence("online", `${entry.platform} heartbeat`, entry.at);
        break;
      case "reject":
        state.rejectCount += 1;
        state.presence = this.snapshotPresence("away", `${entry.platform} rejected or paused`, state.lastHeartbeatAt);
        break;
      case "lifecycle":
        state.presence = this.snapshotPresence(
          state.status === "running" ? "online" : "offline",
          entry.detail,
          state.lastHeartbeatAt,
        );
        break;
      default:
        break;
    }
  }

  private async persistSnapshot(reason: string, snapshot: GatewayHistorySnapshot): Promise<void> {
    const persistedAt = new Date().toISOString();
    const payload = {
      persistedAt,
      ...snapshot,
    };
    writeFileSync(this.snapshotPath, JSON.stringify(payload, null, 2), "utf8");
    appendFileSync(
      this.snapshotHistoryPath,
      `${JSON.stringify({
        persistedAt,
        reason,
        state: snapshot.state,
      })}\n`,
      "utf8",
    );
  }

  private async collectReadiness(): Promise<PlatformHealth[]> {
    const configuredPlatforms = Object.keys(this.context.services.gatewayConfig.platforms) as PlatformName[];
    const known = new Set(this.adapters.keys());
    const startedHealth = await Promise.all(
      Array.from(this.adapters.values()).map(async (adapter) => {
        const health = await adapter.health();
        this.syncPlatformStateFromHealth(health);
        return this.mergePlatformState(health);
      }),
    );
    const inactiveHealth: PlatformHealth[] = configuredPlatforms
      .filter((platform) => !known.has(platform))
      .map((platform) => {
        const mode: PlatformHealth["mode"] = platform === "telegram" ? "native" : "mock";
        const inactive = {
          platform,
          status: "stopped" as const,
          ready: false,
          mode,
          capabilities: capabilitiesForPlatform(platform),
          detail: this.describeInactivePlatform(platform),
          events: [
            {
              at: new Date().toISOString(),
              kind: "health" as const,
              detail: this.describeInactivePlatform(platform),
            },
          ],
          presence: {
            status: "offline" as const,
            activity: `${platform} transport is inactive`,
            lastPresenceChangeAt: new Date().toISOString(),
          },
        };
        this.syncPlatformStateFromHealth(inactive);
        return this.mergePlatformState(inactive);
      });
    return [...startedHealth, ...inactiveHealth];
  }

  private mergePlatformState(health: PlatformHealth): PlatformHealth {
    const state = this.ensurePlatformState(health.platform);
    return {
      ...health,
      lastSendAt: health.lastSendAt ?? state.lastUpdatedAt,
      lastDeliveryAt: health.lastDeliveryAt ?? state.lastDeliveryAt,
      lastDeliveryId: health.lastDeliveryId ?? state.lastDeliveryId,
      lastOutboundRoomId: health.lastOutboundRoomId ?? state.lastOutboundRoomId,
      lastOutboundUserId: health.lastOutboundUserId ?? state.lastOutboundUserId,
      lastOutboundThreadId: health.lastOutboundThreadId ?? state.lastOutboundThreadId,
      lastOutboundReplyToId: health.lastOutboundReplyToId ?? state.lastOutboundReplyToId,
      lastOutboundMetadataKeys: health.lastOutboundMetadataKeys ?? state.lastOutboundMetadataKeys,
      lastReceivedAt: health.lastReceivedAt ?? state.lastReceivedAt,
      lastRoutedAt: health.lastRoutedAt ?? state.lastRoutedAt,
      lastRespondedAt: health.lastRespondedAt ?? state.lastRespondedAt,
      lastHeartbeatAt: health.lastHeartbeatAt ?? state.lastHeartbeatAt,
      sendCount: health.sendCount ?? state.sendCount,
      lastError: health.lastError ?? undefined,
      presence: health.presence ?? state.presence,
      events: health.events,
    };
  }

  private buildStateSnapshot(
    readiness: PlatformHealth[],
    allTraces: GatewayTraceRecord[],
    traces: GatewayTraceRecord[],
    deliveries: DeliveredMessageRecord[],
    sessions: SessionRoute[],
    reason: string,
  ): GatewayStateSnapshot {
    const timestamp = new Date().toISOString();
    const platformSummary = readiness.map((entry) => {
      const platformTraces = allTraces.filter((trace) => trace.platform === entry.platform);
      const latestTrace = platformTraces.at(-1);
      const state = this.ensurePlatformState(entry.platform);
      return {
        platform: entry.platform,
        status: entry.status,
        mode: entry.mode,
        ready: entry.ready,
        detail: entry.detail,
        presence: entry.presence ?? state.presence,
        lastError: state.lastError,
        sendCount: entry.sendCount ?? 0,
        receiveCount: state.receiveCount,
        routeCount: state.routeCount,
        respondCount: state.respondCount,
        heartbeatCount: state.heartbeatCount,
        authorizeCount: state.authorizeCount,
        rejectCount: state.rejectCount,
        lastDeliveryAt: entry.lastDeliveryAt,
        lastDeliveryId: entry.lastDeliveryId,
        lastOutboundRoomId: entry.lastOutboundRoomId,
        lastOutboundUserId: entry.lastOutboundUserId,
        lastOutboundThreadId: entry.lastOutboundThreadId,
        lastOutboundReplyToId: entry.lastOutboundReplyToId,
        lastOutboundMetadataKeys: entry.lastOutboundMetadataKeys,
        lastReceivedAt: entry.lastReceivedAt ?? state.lastReceivedAt,
        lastRoutedAt: entry.lastRoutedAt ?? state.lastRoutedAt,
        lastRespondedAt: entry.lastRespondedAt ?? state.lastRespondedAt,
        lastHeartbeatAt: entry.lastHeartbeatAt ?? state.lastHeartbeatAt,
        lastSessionId: state.lastSessionId,
        lastRoomId: state.lastRoomId,
        lastUserId: state.lastUserId,
        eventCount: entry.events.length,
        lastEventAt: entry.events[0]?.at,
        lastEventKind: entry.events[0]?.kind,
        lastEventDetail: entry.events[0]?.detail,
        traceCount: platformTraces.length,
        lastTraceAt: latestTrace?.at,
        lastTraceKind: latestTrace?.kind,
        lastTraceDetail: latestTrace?.detail,
        lastUpdatedAt: state.lastUpdatedAt ?? timestamp,
      };
    });

    return {
      running: this.running,
      updatedAt: timestamp,
      reason,
      heartbeatAt: this.platformStates.size > 0
        ? Array.from(this.platformStates.values())
            .map((state) => state.lastHeartbeatAt)
            .filter(Boolean)
            .at(-1)
        : undefined,
      snapshotPath: this.snapshotPath,
      historyPath: this.snapshotHistoryPath,
      totals: {
        configuredPlatforms: readiness.length,
        activeAdapters: readiness.filter((entry) => entry.status === "running").length,
        readyAdapters: readiness.filter((entry) => entry.ready).length,
        nativeAdapters: readiness.filter((entry) => entry.mode === "native").length,
        mockAdapters: readiness.filter((entry) => entry.mode === "mock").length,
        totalTraces: allTraces.length,
        recentTraces: traces.length,
        recentDeliveries: deliveries.length,
        recentSessions: sessions.length,
      },
      platforms: platformSummary,
      tracesByKind: this.countByKind(allTraces, (trace) => trace.kind),
      tracesByPlatform: this.countByPlatform(allTraces, (trace) => trace.platform),
      deliveriesByPlatform: this.countByPlatform(deliveries, (delivery) => delivery.target.platform),
      sessionsByPlatform: this.countByPlatform(sessions, (session) => session.platform),
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const gatewayConfig = loadGatewayConfig(this.context.config);
    for (const [platform, platformConfig] of Object.entries(gatewayConfig.platforms)) {
      if (!platformConfig.enabled) {
        continue;
      }

      const adapter = this.createAdapter(platform as PlatformName);
      await adapter.start();
      this.adapters.set(platform as PlatformName, adapter);
      const health = await adapter.health();
      this.syncPlatformStateFromHealth(health);
      this.pushTrace({
        traceId: randomUUID(),
        at: new Date().toISOString(),
        kind: "lifecycle",
        platform: platform as PlatformName,
        detail: `Adapter started for ${platform}.`,
      });
      await this.observeAdapter(platform as PlatformName, {
        at: new Date().toISOString(),
        kind: "start",
        detail: `Gateway runner registered live state for ${platform}.`,
      });
    }

    this.running = true;
    await this.context.services.hooks.emit("gateway:startup", {
      platforms: Array.from(this.adapters.keys()).join(","),
    });
    if (!this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        void this.heartbeat("interval");
      }, 60_000);
      this.heartbeatInterval.unref?.();
    }
    await this.heartbeat("startup");
  }

  private createAdapter(platform: PlatformName): PlatformAdapter {
    if (platform === "telegram") {
      return new TelegramPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "discord") {
      return new DiscordPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "slack") {
      return new SlackPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "whatsapp") {
      return new WhatsAppPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "signal") {
      return new SignalPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "matrix") {
      return new MatrixPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "email") {
      return new EmailPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "sms") {
      return new SmsPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }

    return new MockPlatformAdapter(platform, this.context.services.delivery);
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [platform, adapter] of this.adapters.entries()) {
      await adapter.stop();
      this.pushTrace({
        traceId: randomUUID(),
        at: new Date().toISOString(),
        kind: "lifecycle",
        platform,
        detail: `Adapter stopped for ${platform}.`,
      });
      await this.observeAdapter(platform, {
        at: new Date().toISOString(),
        kind: "stop",
        detail: `Adapter stopped for ${platform}.`,
      });
    }

    this.pushTrace({
      traceId: randomUUID(),
      at: new Date().toISOString(),
      kind: "lifecycle",
      platform: "gateway",
      detail: "Gateway stopped and all adapters were shut down.",
    });
    this.running = false;
    await this.context.services.hooks.emit("gateway:shutdown", {
      status: "stopped",
    });
    await this.snapshotState("stop", 20);
    this.adapters.clear();
  }

  async heartbeat(reason = "heartbeat"): Promise<GatewayStateSnapshot> {
    const heartbeatAt = new Date().toISOString();
    for (const platform of this.adapters.keys()) {
      const detail = `${platform} transport heartbeat at ${heartbeatAt}.`;
      this.pushTrace({
        traceId: randomUUID(),
        at: heartbeatAt,
        kind: "heartbeat",
        platform,
        detail,
      });
      await this.observeAdapter(platform, {
        at: heartbeatAt,
        kind: "heartbeat",
        detail,
      });
    }

    this.pushTrace({
      traceId: randomUUID(),
      at: heartbeatAt,
      kind: "heartbeat",
      platform: "gateway",
      detail: `Gateway heartbeat recorded for ${this.adapters.size} adapters.`,
    });
    await this.context.services.hooks.emit("gateway:heartbeat", {
      status: this.running ? "running" : "stopped",
      adapters: String(this.adapters.size),
    });
    const snapshot = await this.snapshotState(reason, 20);
    return snapshot.state;
  }

  async receive(message: IncomingPlatformMessage): Promise<{
    ok: boolean;
    response: string;
    pairingCode?: string;
    traceId?: string;
    sessionId?: string;
    deliveryId?: string;
  }> {
    const traceId = randomUUID();
    this.pushTrace({
      traceId,
      at: new Date().toISOString(),
      kind: "receive",
      platform: message.platform,
      detail: `Inbound message received for ${message.platform}.`,
      userId: message.userId,
      roomId: message.roomId,
      messageId: message.messageId,
      threadId: message.threadId,
      replyToMessageId: message.replyToMessageId,
      metadataKeys: Object.keys(message.metadata ?? {}),
    });
    await this.observeAdapter(message.platform, {
      at: new Date().toISOString(),
      kind: "receive",
      detail: `Inbound message received for ${message.platform} with metadata keys ${Object.keys(message.metadata ?? {}).join(",") || "none"}.`,
    });

    const adapter = this.adapters.get(message.platform);
    if (adapter && !adapter.canReceive()) {
      this.pushTrace({
        traceId,
        at: new Date().toISOString(),
        kind: "reject",
        platform: message.platform,
        detail: `${message.platform} transport is not ready for inbound traffic.`,
        userId: message.userId,
        roomId: message.roomId,
      });
      await this.observeAdapter(message.platform, {
        at: new Date().toISOString(),
        kind: "reject",
        detail: `${message.platform} transport is not ready for inbound traffic.`,
      });
      return {
        ok: false,
        response: `${message.platform} transport is not ready for inbound traffic.`,
        traceId,
      };
    }

    const gatewayConfig = loadGatewayConfig(this.context.config);
    const auth = authorizeMessage(message, gatewayConfig, this.context.services.pairing);
    if (!auth.allowed) {
      const response = auth.pairingCode
        ? `Authorization required. Pairing code: ${auth.pairingCode}`
        : auth.reason ?? "Unauthorized";
      this.pushTrace({
        traceId,
        at: new Date().toISOString(),
        kind: "authorize",
        platform: message.platform,
        detail: `Authorization failed for ${message.platform}: ${auth.reason ?? "unauthorized"}.`,
        userId: message.userId,
        roomId: message.roomId,
      });
      await this.observeAdapter(message.platform, {
        at: new Date().toISOString(),
        kind: "reject",
        detail: `Authorization failed for ${message.platform}: ${auth.reason ?? "unauthorized"}.`,
      });

      await this.context.services.hooks.emit("gateway:unauthorized", {
        platform: message.platform,
        userId: message.userId,
        pairingCode: auth.pairingCode ?? "",
      });
      return {
        ok: false,
        response,
        pairingCode: auth.pairingCode,
        traceId,
      };
    }

    const session = this.context.services.gatewaySessions.resolve(message);
    this.pushTrace({
      traceId,
      at: new Date().toISOString(),
      kind: "authorize",
      platform: message.platform,
      detail: `Authorization succeeded for ${message.platform}.`,
      sessionId: session.sessionKey,
      userId: message.userId,
      roomId: message.roomId,
      messageId: message.messageId,
      threadId: message.threadId,
      replyToMessageId: message.replyToMessageId,
      metadataKeys: Object.keys(session.metadata ?? {}),
    });
    this.pushTrace({
      traceId,
      at: new Date().toISOString(),
      kind: "session",
      platform: message.platform,
      detail: `Session resolved to ${session.sessionKey}.`,
      sessionId: session.sessionKey,
      userId: message.userId,
      roomId: message.roomId,
      messageId: message.messageId,
      threadId: message.threadId,
      replyToMessageId: message.replyToMessageId,
      metadataKeys: Object.keys(session.metadata ?? {}),
    });
    await this.observeAdapter(message.platform, {
      at: new Date().toISOString(),
      kind: "authorize",
      detail: `${message.platform} authorization succeeded for session ${session.sessionKey}.`,
    });
    this.pushTrace({
      traceId,
      at: new Date().toISOString(),
      kind: "route",
      platform: message.platform,
      detail: `Inbound ${message.platform} traffic routed to session ${session.sessionKey}.`,
      sessionId: session.sessionKey,
      userId: message.userId,
      roomId: message.roomId,
      messageId: message.messageId,
      threadId: message.threadId,
      replyToMessageId: message.replyToMessageId,
      metadataKeys: Object.keys(session.metadata ?? {}),
    });
    await this.observeAdapter(message.platform, {
      at: new Date().toISOString(),
      kind: "route",
      detail: `Inbound ${message.platform} traffic routed to session ${session.sessionKey}.`,
    });
    await this.context.services.hooks.emit("session:start", {
      platform: message.platform,
      userId: message.userId,
      sessionId: session.sessionKey,
    });

    const response = await handleAgentTurn(
      {
        message: message.text,
        userId: message.userId,
        roomId: session.sessionKey,
      source: message.platform,
      },
      this.context,
    );
    this.pushTrace({
      traceId,
      at: new Date().toISOString(),
      kind: "respond",
      platform: message.platform,
      detail: `Agent produced a response for ${message.platform}.`,
      sessionId: session.sessionKey,
      userId: message.userId,
      roomId: message.roomId,
    });
    await this.observeAdapter(message.platform, {
      at: new Date().toISOString(),
      kind: "respond",
      detail: `Agent produced a response for ${message.platform} in session ${session.sessionKey}.`,
    });

    let deliveryId: string | undefined;
    if (adapter) {
      const outbound: OutboundPlatformMessage = {
        roomId: message.channelId ?? message.roomId,
        userId: message.userId,
        text: response,
        threadId: message.threadId ?? session.threadId,
        replyToId: message.messageId ?? message.replyToMessageId,
        metadata: message.metadata,
      };
      try {
        const delivery = await adapter.send(outbound);
        deliveryId = delivery.id;
        this.pushTrace({
          traceId,
          at: new Date().toISOString(),
          kind: "deliver",
          platform: message.platform,
          detail: `Delivered via ${adapter.name} to ${outbound.roomId} with record ${delivery.id}.`,
          sessionId: session.sessionKey,
          userId: message.userId,
          roomId: message.roomId,
          threadId: outbound.threadId,
          replyToMessageId: outbound.replyToId,
          deliveryId: delivery.id,
          metadataKeys: Object.keys(delivery.metadata ?? {}),
        });
        await this.observeAdapter(message.platform, {
          at: new Date().toISOString(),
          kind: "deliver",
          detail: `Delivered via ${adapter.name} to ${outbound.roomId} with record ${delivery.id}.`,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : `Delivery via ${adapter.name} failed.`;
        this.pushTrace({
          traceId,
          at: new Date().toISOString(),
          kind: "reject",
          platform: message.platform,
          detail,
          sessionId: session.sessionKey,
          userId: message.userId,
          roomId: message.roomId,
        });
        await this.observeAdapter(message.platform, {
          at: new Date().toISOString(),
          kind: "reject",
          detail,
        });
        throw error;
      }
    } else {
      const delivery = this.context.services.delivery.deliver(
        {
          platform: message.platform,
          channelId: message.channelId ?? message.roomId,
          userId: message.userId,
          mode: "origin",
        },
        response,
        {
          threadId: message.threadId,
          replyToId: message.replyToMessageId,
          metadata: message.metadata,
        },
      );
      deliveryId = delivery.id;
      this.pushTrace({
        traceId,
        at: new Date().toISOString(),
        kind: "deliver",
        platform: message.platform,
        detail: `Delivered via fallback history with record ${delivery.id}.`,
        sessionId: session.sessionKey,
        userId: message.userId,
        roomId: message.roomId,
        threadId: message.threadId,
        replyToMessageId: message.replyToMessageId,
        deliveryId: delivery.id,
        metadataKeys: Object.keys(delivery.metadata ?? {}),
      });
      await this.observeAdapter(message.platform, {
        at: new Date().toISOString(),
        kind: "deliver",
        detail: `Delivered via fallback history with record ${delivery.id}.`,
      });
    }

    await this.context.services.hooks.emit("agent:end", {
      platform: message.platform,
      userId: message.userId,
      sessionId: session.sessionKey,
      response,
    });

    await this.snapshotState("receive", 20);

    return {
      ok: true,
      response,
      traceId,
      sessionId: session.sessionKey,
      deliveryId,
    };
  }

  async health(): Promise<Array<PlatformHealth>> {
    const snapshot = await this.snapshotState("health", 20);
    return snapshot.readiness;
  }

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.filteredTraces(filters).slice(-limit).reverse();
  }

  async state(limit = 20, filters?: GatewayHistoryFilter): Promise<GatewayStateSnapshot> {
    return (await this.history(limit, filters)).state;
  }

  async history(limit = 20, filters?: GatewayHistoryFilter): Promise<GatewayHistorySnapshot> {
    return this.snapshotState("history", limit, filters);
  }

  private async snapshotState(
    reason: string,
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    const readiness = await this.collectReadiness();
    const allTraces = this.filteredTraces(filters);
    const traces = allTraces.slice(-limit).reverse();
    const deliveries = this.recentDeliveries(limit, filters?.platform);
    const sessions = this.recentSessions(limit, filters?.platform);
    const state = this.buildStateSnapshot(readiness, allTraces, traces, deliveries, sessions, reason);
    const snapshot: GatewayHistorySnapshot = {
      updatedAt: state.updatedAt,
      reason,
      snapshotPath: this.snapshotPath,
      historyPath: this.snapshotHistoryPath,
      readiness,
      traces,
      deliveries,
      sessions,
      state,
    };
    await this.persistSnapshot(reason, snapshot);
    return snapshot;
  }

  private filteredTraces(filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.traceLog.filter((trace) => {
      if (filters?.platform && trace.platform !== filters.platform) {
        return false;
      }
      if (filters?.kind && trace.kind !== filters.kind) {
        return false;
      }
      if (filters?.sessionId && trace.sessionId !== filters.sessionId) {
        return false;
      }
      return true;
    });
  }

  private recentDeliveries(limit = 20, platform?: PlatformName): DeliveredMessageRecord[] {
    const records = this.context.services.delivery.recent(Math.max(limit * 4, 50));
    const filtered = platform ? records.filter((record) => record.target.platform === platform) : records;
    return filtered.slice(0, limit);
  }

  private recentSessions(limit = 20, platform?: PlatformName): SessionRoute[] {
    const sessions = this.context.services.gatewaySessions
      .list()
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const filtered = platform ? sessions.filter((session) => session.platform === platform) : sessions;
    return filtered.slice(0, limit);
  }

  private countByPlatform<T, K extends PlatformName | "gateway">(
    records: T[],
    selector: (record: T) => K,
  ): Array<{ platform: K; count: number }> {
    const counts = new Map<K, { platform: K; count: number }>();
    for (const record of records) {
      const key = selector(record);
      const existing = counts.get(key) ?? { platform: key, count: 0 };
      existing.count += 1;
      counts.set(key, existing);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }

  private countByKind<T>(
    records: T[],
    selector: (record: T) => GatewayTraceRecord["kind"],
  ): Array<{ kind: GatewayTraceRecord["kind"]; count: number }> {
    const counts = new Map<GatewayTraceRecord["kind"], { kind: GatewayTraceRecord["kind"]; count: number }>();
    for (const record of records) {
      const key = selector(record);
      const existing = counts.get(key) ?? { kind: key, count: 0 };
      existing.count += 1;
      counts.set(key, existing);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }

  private describeInactivePlatform(platform: PlatformName): string {
    const platformConfig = this.context.services.gatewayConfig.platforms[platform];
    const capabilities = capabilitiesForPlatform(platform);
    if (!platformConfig.enabled) {
      if (LIGHTWEIGHT_WEBHOOK_PLATFORMS.has(platform)) {
        return "Lightweight webhook-normalized routing is available when enabled; messages are session-routed and retained in delivery history even without a native adapter.";
      }
      return "Platform is disabled in gateway configuration.";
    }

    const capabilitySummary = [
      capabilities.inbound ? "inbound" : null,
      capabilities.outbound ? "outbound" : null,
      capabilities.replies ? "replies" : null,
      capabilities.threads ? "threads" : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (LIGHTWEIGHT_WEBHOOK_PLATFORMS.has(platform)) {
      return `Lightweight webhook-normalized support is active for ${platform}; ${capabilitySummary} are routed through shared session and delivery history.`;
    }

    return `Platform is enabled but the adapter is not running; ${capabilitySummary} remain queued until a native adapter starts.`;
  }

  private pushTrace(entry: GatewayTraceRecord): void {
    this.traceLog.push(entry);
    this.updatePlatformStateFromTrace(entry);
    if (this.traceLog.length > 200) {
      this.traceLog.splice(0, this.traceLog.length - 200);
    }
  }
}
