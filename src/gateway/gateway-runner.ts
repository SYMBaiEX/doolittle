import { loadGatewayConfig } from "@/config/gateway";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import { randomUUID } from "node:crypto";
import { authorizeMessage } from "./authorization";
import {
  capabilitiesForPlatform,
  type PlatformLifecycleEvent,
  type PlatformAdapter,
  type PlatformHealth,
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
  kind: "receive" | "authorize" | "session" | "respond" | "deliver" | "reject" | "lifecycle";
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
  sendCount: number;
  lastDeliveryAt?: string;
  lastDeliveryId?: string;
  lastOutboundRoomId?: string;
  lastOutboundUserId?: string;
  lastOutboundThreadId?: string;
  lastOutboundReplyToId?: string;
  lastOutboundMetadataKeys?: string[];
  eventCount: number;
  lastEventAt?: string;
  lastEventKind?: PlatformLifecycleEvent["kind"];
}

interface GatewayHistorySnapshot {
  readiness: PlatformHealth[];
  traces: GatewayTraceRecord[];
  deliveries: DeliveredMessageRecord[];
  sessions: SessionRoute[];
  state: GatewayStateSnapshot;
}

interface GatewayStateSnapshot {
  running: boolean;
  totals: {
    configuredPlatforms: number;
    activeAdapters: number;
    readyAdapters: number;
    nativeAdapters: number;
    mockAdapters: number;
    recentTraces: number;
    recentDeliveries: number;
    recentSessions: number;
  };
  platforms: GatewayPlatformState[];
  tracesByKind: Array<{ kind: GatewayTraceRecord["kind"]; count: number }>;
  deliveriesByPlatform: Array<{ platform: PlatformName; count: number }>;
  sessionsByPlatform: Array<{ platform: PlatformName; count: number }>;
}

export class GatewayRunner {
  private readonly adapters = new Map<PlatformName, PlatformAdapter>();
  private readonly traceLog: GatewayTraceRecord[] = [];
  private running = false;

  constructor(private readonly context: AppContext) {}

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
      this.pushTrace({
        traceId: randomUUID(),
        at: new Date().toISOString(),
        kind: "lifecycle",
        platform: platform as PlatformName,
        detail: `Adapter started for ${platform}.`,
      });
    }

    this.running = true;
    await this.context.services.hooks.emit("gateway:startup", {
      platforms: Array.from(this.adapters.keys()).join(","),
    });
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
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
    this.pushTrace({
      traceId: randomUUID(),
      at: new Date().toISOString(),
      kind: "lifecycle",
      platform: "gateway",
      detail: "Gateway stopped and all adapters were shut down.",
    });
    this.adapters.clear();
    this.running = false;
    await this.context.services.hooks.emit("gateway:shutdown", {
      status: "stopped",
    });
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
    }

    await this.context.services.hooks.emit("agent:end", {
      platform: message.platform,
      userId: message.userId,
      sessionId: session.sessionKey,
      response,
    });

    return {
      ok: true,
      response,
      traceId,
      sessionId: session.sessionKey,
      deliveryId,
    };
  }

  async health(): Promise<Array<PlatformHealth>> {
    const configuredPlatforms = Object.keys(this.context.services.gatewayConfig.platforms) as PlatformName[];
    const known = new Set(this.adapters.keys());
    const startedHealth = await Promise.all(
      Array.from(this.adapters.values()).map((adapter) => adapter.health()),
    );
    const inactiveHealth: PlatformHealth[] = configuredPlatforms
      .filter((platform) => !known.has(platform))
      .map((platform) => ({
        platform,
        status: "stopped",
        ready: false,
        mode: platform === "telegram" ? "native" : "mock",
        capabilities: capabilitiesForPlatform(platform),
        detail: this.describeInactivePlatform(platform),
        events: [
          {
            at: new Date().toISOString(),
            kind: "health",
            detail: this.describeInactivePlatform(platform),
          },
        ],
      }));
    return [...startedHealth, ...inactiveHealth];
  }

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.filteredTraces(filters).slice(-limit).reverse();
  }

  async state(limit = 20, filters?: GatewayHistoryFilter): Promise<GatewayStateSnapshot> {
    return (await this.history(limit, filters)).state;
  }

  async history(limit = 20, filters?: GatewayHistoryFilter): Promise<GatewayHistorySnapshot> {
    const readiness = await this.health();
    const traces = this.trace(limit, filters);
    const deliveries = this.recentDeliveries(limit, filters?.platform);
    const sessions = this.recentSessions(limit, filters?.platform);
    return {
      readiness,
      traces,
      deliveries,
      sessions,
      state: this.buildStateSnapshot(readiness, traces, deliveries, sessions),
    };
  }

  private buildStateSnapshot(
    readiness: PlatformHealth[],
    traces: GatewayTraceRecord[],
    deliveries: DeliveredMessageRecord[],
    sessions: SessionRoute[],
  ): GatewayStateSnapshot {
    const platformSummary = readiness.map((entry) => ({
      platform: entry.platform,
      status: entry.status,
      mode: entry.mode,
      ready: entry.ready,
      detail: entry.detail,
      sendCount: entry.sendCount ?? 0,
      lastDeliveryAt: entry.lastDeliveryAt,
      lastDeliveryId: entry.lastDeliveryId,
      lastOutboundRoomId: entry.lastOutboundRoomId,
      lastOutboundUserId: entry.lastOutboundUserId,
      lastOutboundThreadId: entry.lastOutboundThreadId,
      lastOutboundReplyToId: entry.lastOutboundReplyToId,
      lastOutboundMetadataKeys: entry.lastOutboundMetadataKeys,
      eventCount: entry.events.length,
      lastEventAt: entry.events[0]?.at,
      lastEventKind: entry.events[0]?.kind,
    }));

    return {
      running: this.running,
      totals: {
        configuredPlatforms: readiness.length,
        activeAdapters: readiness.filter((entry) => entry.status === "running").length,
        readyAdapters: readiness.filter((entry) => entry.ready).length,
        nativeAdapters: readiness.filter((entry) => entry.mode === "native").length,
        mockAdapters: readiness.filter((entry) => entry.mode === "mock").length,
        recentTraces: traces.length,
        recentDeliveries: deliveries.length,
        recentSessions: sessions.length,
      },
      platforms: platformSummary,
      tracesByKind: this.countByKind(traces, (trace) => trace.kind),
      deliveriesByPlatform: this.countByPlatform(deliveries, (delivery) => delivery.target.platform),
      sessionsByPlatform: this.countByPlatform(sessions, (session) => session.platform),
    };
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

  private countByPlatform<T>(
    records: T[],
    selector: (record: T) => PlatformName,
  ): Array<{ platform: PlatformName; count: number }> {
    const counts = new Map<PlatformName, { platform: PlatformName; count: number }>();
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
    if (this.traceLog.length > 200) {
      this.traceLog.splice(0, this.traceLog.length - 200);
    }
  }
}
