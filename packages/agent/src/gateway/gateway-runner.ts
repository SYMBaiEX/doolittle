import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadGatewayConfig } from "@/config/gateway";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
  SessionRoute,
} from "@/types";
import { authorizeMessage } from "./authorization";
import {
  capabilitiesForPlatform,
  nowIso,
  type PlatformAdapter,
  type PlatformHealth,
  type PlatformLifecycleEvent,
  type PlatformPresenceState,
} from "./platforms/base";
import { DingtalkPlatformAdapter } from "./platforms/dingtalk-adapter";
import { DiscordPlatformAdapter } from "./platforms/discord-adapter";
import { EmailPlatformAdapter } from "./platforms/email-adapter";
import { HomeAssistantPlatformAdapter } from "./platforms/homeassistant-adapter";
import { MatrixPlatformAdapter } from "./platforms/matrix-adapter";
import { MattermostPlatformAdapter } from "./platforms/mattermost-adapter";
import { MockPlatformAdapter } from "./platforms/mock-adapter";
import { SignalPlatformAdapter } from "./platforms/signal-adapter";
import { SlackPlatformAdapter } from "./platforms/slack-adapter";
import { SmsPlatformAdapter } from "./platforms/sms-adapter";
import { TelegramPlatformAdapter } from "./platforms/telegram-adapter";
import { WhatsAppPlatformAdapter } from "./platforms/whatsapp-adapter";

const LIGHTWEIGHT_WEBHOOK_PLATFORMS = new Set<PlatformName>([
  "signal",
  "matrix",
  "email",
  "sms",
]);

const NATIVE_PLATFORM_ADAPTERS = new Set<PlatformName>([
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "email",
  "sms",
  "mattermost",
  "homeassistant",
  "dingtalk",
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
    | "update"
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

interface GatewayInboxRecord {
  recordId: string;
  at: string;
  platform: PlatformName;
  sessionId?: string;
  traceId: string;
  status: "received" | "accepted" | "rejected";
  userId: string;
  roomId: string;
  channelId?: string;
  threadId?: string;
  messageId?: string;
  replyToMessageId?: string;
  channelType?: string;
  authorName?: string;
  textPreview: string;
  attachmentCount: number;
  attachmentKinds: string[];
  attachmentNames: string[];
  attachmentUrls: string[];
  attachmentMimeTypes: string[];
  metadataKeys: string[];
  metadata: Record<string, string>;
  notes?: string[];
}

interface GatewayOutboxRecord {
  recordId: string;
  at: string;
  platform: PlatformName;
  sessionId?: string;
  traceId: string;
  status: "sent" | "fallback" | "rejected" | "edited";
  deliveryId?: string;
  userId?: string;
  roomId: string;
  threadId?: string;
  replyToMessageId?: string;
  textPreview: string;
  attachmentCount: number;
  attachmentKinds: string[];
  attachmentNames: string[];
  attachmentUrls: string[];
  attachmentMimeTypes: string[];
  metadataKeys: string[];
  metadata: Record<string, string>;
  notes?: string[];
}

interface GatewayAttachmentRecord {
  attachmentId: string;
  recordId: string;
  at: string;
  direction: "inbox" | "outbox";
  platform: PlatformName;
  sessionId?: string;
  traceId: string;
  deliveryId?: string;
  messageId?: string;
  userId?: string;
  roomId: string;
  threadId?: string;
  replyToMessageId?: string;
  kind: string;
  name?: string;
  url?: string;
  mimeType?: string;
  size?: string;
  caption?: string;
  durationMs?: string;
  width?: string;
  height?: string;
  metadataKeys: string[];
  metadata: Record<string, string>;
}

interface GatewayHistoryFilter {
  platform?: PlatformName;
  kind?: GatewayTraceRecord["kind"];
  sessionId?: string;
}

interface GatewayPlatformState {
  platform: PlatformName;
  nativePluginId?: string;
  nativePluginSource?: "official" | "vendored" | "custom";
  nativePluginEnabled?: boolean;
  nativePluginNotes?: string;
  status: PlatformHealth["status"];
  mode: PlatformHealth["mode"];
  ready: boolean;
  transportState: "inactive" | "booting" | "live" | "degraded" | "paused";
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
  lastOutboundAt?: string;
  lastReceivedAt?: string;
  lastInboundAt?: string;
  lastRoutedAt?: string;
  lastRespondedAt?: string;
  lastHeartbeatAt?: string;
  lastSessionId?: string;
  lastRoomId?: string;
  lastUserId?: string;
  lastAttachmentAt?: string;
  lastAttachmentKind?: string;
  inboxCount: number;
  outboxCount: number;
  attachmentCount: number;
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
  inbox: GatewayInboxRecord[];
  outbox: GatewayOutboxRecord[];
  attachments: GatewayAttachmentRecord[];
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
    gatewayEnabledTransports: number;
    operationalTransports: number;
    nativeAdapters: number;
    mockAdapters: number;
    pluginMediatedAdapters: number;
    officialPluginAdapters: number;
    vendoredPluginAdapters: number;
    totalTraces: number;
    recentTraces: number;
    inboxMessages: number;
    outboxMessages: number;
    attachmentRecords: number;
    recentDeliveries: number;
    recentSessions: number;
  };
  platforms: GatewayPlatformState[];
  tracesByKind: Array<{ kind: GatewayTraceRecord["kind"]; count: number }>;
  tracesByPlatform: Array<{
    platform: PlatformName | "gateway";
    count: number;
  }>;
  inboxByPlatform: Array<{ platform: PlatformName; count: number }>;
  outboxByPlatform: Array<{ platform: PlatformName; count: number }>;
  attachmentsByPlatform: Array<{ platform: PlatformName; count: number }>;
  attachmentsByKind: Array<{ kind: string; count: number }>;
  deliveriesByPlatform: Array<{ platform: PlatformName; count: number }>;
  sessionsByPlatform: Array<{ platform: PlatformName; count: number }>;
}

interface GatewayRuntimeStatus {
  pid: number;
  running: boolean;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  lastSupervisionAt?: string;
  supervisionEvents: number;
  adapters: PlatformName[];
  transportControl: ReturnType<typeof getNativeTransportControlPlane>["totals"];
  messagingBridge: ReturnType<
    typeof getNativeTransportControlPlane
  >["messagingBridge"];
  transportInventory: ReturnType<
    typeof getNativeTransportControlPlane
  >["transportInventory"];
}

interface GatewaySupervisionRecord {
  at: string;
  platform: PlatformName | "gateway";
  action: "health" | "restart" | "recover" | "watch" | "skip";
  detail: string;
}

export class GatewayRunner {
  private readonly events = new EventEmitter();
  private readonly adapters = new Map<PlatformName, PlatformAdapter>();
  private readonly traceLog: GatewayTraceRecord[] = [];
  private readonly inboxLog: GatewayInboxRecord[] = [];
  private readonly outboxLog: GatewayOutboxRecord[] = [];
  private readonly attachmentLog: GatewayAttachmentRecord[] = [];
  private readonly platformStates = new Map<
    PlatformName,
    GatewayPlatformState
  >();
  private readonly snapshotDir: string;
  private readonly journalDir: string;
  private readonly snapshotPath: string;
  private readonly snapshotHistoryPath: string;
  private readonly runtimeStatusPath: string;
  private readonly supervisionPath: string;
  private readonly inboxPath: string;
  private readonly outboxPath: string;
  private readonly attachmentsPath: string;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private supervisionInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private startedAt?: string;
  private stoppedAt?: string;
  private lastHeartbeatAt?: string;
  private lastSupervisionAt?: string;
  private readonly supervisionLog: GatewaySupervisionRecord[] = [];

  private getTransportControlPlane() {
    return getNativeTransportControlPlane(
      this.context.runtime,
      this.context.config,
      this.context.services.gatewayConfig,
    );
  }

  private getTransportInventoryEntry(platform: PlatformName) {
    return this.getTransportControlPlane().transportInventory.find(
      (entry) => entry.platform === platform,
    );
  }

  private resolveNativeMessagingPlugin(platform: PlatformName) {
    const suffix = `.${platform}`;
    const plugin = getNativePluginCatalog(this.context.config).find(
      (entry) => entry.category === "messaging" && entry.id.endsWith(suffix),
    );
    const bridge = this.getTransportControlPlane().messagingBridge.find(
      (entry) => entry.platform === platform,
    );
    if (!plugin) {
      return bridge
        ? {
            id: bridge.pluginId,
            source: bridge.pluginSource,
            enabled: bridge.pluginEnabled,
            notes: bridge.detail,
          }
        : undefined;
    }
    return {
      ...plugin,
      notes: bridge ? `${plugin.notes} ${bridge.detail}` : plugin.notes,
    };
  }

  constructor(private readonly context: AppContext) {
    this.snapshotDir = join(this.context.config.gatewayDataDir, "snapshots");
    this.journalDir = join(this.context.config.gatewayDataDir, "journals");
    this.snapshotPath = join(this.snapshotDir, "gateway-state.json");
    this.snapshotHistoryPath = join(
      this.snapshotDir,
      "gateway-state-history.jsonl",
    );
    this.runtimeStatusPath = join(this.snapshotDir, "gateway-runtime.json");
    this.supervisionPath = join(this.journalDir, "gateway-supervision.jsonl");
    this.inboxPath = join(this.journalDir, "gateway-inbox.jsonl");
    this.outboxPath = join(this.journalDir, "gateway-outbox.jsonl");
    this.attachmentsPath = join(this.journalDir, "gateway-attachments.jsonl");
    mkdirSync(this.snapshotDir, { recursive: true });
    mkdirSync(this.journalDir, { recursive: true });
    this.ensureJournalFile(this.inboxPath);
    this.ensureJournalFile(this.outboxPath);
    this.ensureJournalFile(this.attachmentsPath);
    this.ensureJournalFile(this.supervisionPath);
    this.inboxLog.push(...this.loadJournal<GatewayInboxRecord>(this.inboxPath));
    this.outboxLog.push(
      ...this.loadJournal<GatewayOutboxRecord>(this.outboxPath),
    );
    this.attachmentLog.push(
      ...this.loadJournal<GatewayAttachmentRecord>(this.attachmentsPath),
    );
    this.supervisionLog.push(
      ...this.loadJournal<GatewaySupervisionRecord>(this.supervisionPath),
    );
  }

  private ensureJournalFile(pathname: string): void {
    if (!existsSync(pathname)) {
      writeFileSync(pathname, "", "utf8");
    }
  }

  private loadJournal<T>(pathname: string): T[] {
    if (!existsSync(pathname)) {
      return [];
    }

    const raw = readFileSync(pathname, "utf8").trim();
    if (!raw) {
      return [];
    }

    return raw
      .split("\n")
      .map((line) => {
        try {
          return JSON.parse(line) as T;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is T => Boolean(entry));
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
      nativePluginId: this.resolveNativeMessagingPlugin(platform)?.id,
      nativePluginSource: this.resolveNativeMessagingPlugin(platform)?.source,
      nativePluginEnabled: this.resolveNativeMessagingPlugin(platform)?.enabled,
      nativePluginNotes: this.resolveNativeMessagingPlugin(platform)?.notes,
      status: "stopped",
      mode: "mock",
      ready: false,
      transportState: "inactive",
      detail: `${platform} transport has not been initialized yet.`,
      presence,
      sendCount: 0,
      receiveCount: 0,
      routeCount: 0,
      respondCount: 0,
      heartbeatCount: 0,
      authorizeCount: 0,
      rejectCount: 0,
      lastReceivedAt: undefined,
      lastInboundAt: undefined,
      lastOutboundAt: undefined,
      lastRoutedAt: undefined,
      lastRespondedAt: undefined,
      lastHeartbeatAt: undefined,
      lastSessionId: undefined,
      lastRoomId: undefined,
      lastUserId: undefined,
      lastAttachmentAt: undefined,
      lastAttachmentKind: undefined,
      inboxCount: 0,
      outboxCount: 0,
      attachmentCount: 0,
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

  private syncPlatformStateFromHealth(
    health: PlatformHealth,
  ): GatewayPlatformState {
    const state = this.ensurePlatformState(health.platform);
    const nativePlugin = this.resolveNativeMessagingPlugin(health.platform);
    state.nativePluginId = nativePlugin?.id;
    state.nativePluginSource = nativePlugin?.source;
    state.nativePluginEnabled = nativePlugin?.enabled;
    state.nativePluginNotes = nativePlugin?.notes;
    state.status = health.status;
    state.mode = health.mode;
    state.ready = health.ready;
    state.transportState = this.computeTransportState(
      health.platform,
      health.status,
      health.ready,
    );
    state.detail = health.detail;
    state.sendCount = health.sendCount ?? state.sendCount;
    state.lastDeliveryAt = health.lastDeliveryAt ?? state.lastDeliveryAt;
    state.lastDeliveryId = health.lastDeliveryId ?? state.lastDeliveryId;
    state.lastOutboundRoomId =
      health.lastOutboundRoomId ?? state.lastOutboundRoomId;
    state.lastOutboundUserId =
      health.lastOutboundUserId ?? state.lastOutboundUserId;
    state.lastOutboundThreadId =
      health.lastOutboundThreadId ?? state.lastOutboundThreadId;
    state.lastOutboundReplyToId =
      health.lastOutboundReplyToId ?? state.lastOutboundReplyToId;
    state.lastOutboundMetadataKeys =
      health.lastOutboundMetadataKeys ?? state.lastOutboundMetadataKeys;
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
        state.lastInboundAt = entry.at;
        state.transportState = state.ready ? "live" : "degraded";
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
        state.transportState = state.ready ? "live" : "degraded";
        state.presence = this.snapshotPresence(
          "online",
          `Responding through ${entry.platform}`,
          state.lastHeartbeatAt,
        );
        break;
      case "deliver":
        state.lastDeliveryAt = entry.at;
        state.lastDeliveryId = entry.deliveryId ?? state.lastDeliveryId;
        state.lastOutboundAt = entry.at;
        state.transportState = state.ready ? "live" : "degraded";
        break;
      case "update":
        state.lastDeliveryAt = entry.at;
        state.lastDeliveryId = entry.deliveryId ?? state.lastDeliveryId;
        state.lastOutboundAt = entry.at;
        state.transportState = state.ready ? "live" : "degraded";
        state.presence = this.snapshotPresence(
          "online",
          `Updating delivery on ${entry.platform}`,
          state.lastHeartbeatAt,
        );
        break;
      case "heartbeat":
        state.heartbeatCount += 1;
        state.lastHeartbeatAt = entry.at;
        state.transportState = state.ready ? "live" : state.transportState;
        state.presence = this.snapshotPresence(
          "online",
          `${entry.platform} heartbeat`,
          entry.at,
        );
        break;
      case "reject":
        state.rejectCount += 1;
        state.transportState = state.ready ? "degraded" : "paused";
        state.presence = this.snapshotPresence(
          "away",
          `${entry.platform} rejected or paused`,
          state.lastHeartbeatAt,
        );
        break;
      case "lifecycle":
        state.transportState =
          state.status === "running"
            ? state.ready
              ? "live"
              : "degraded"
            : "inactive";
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

  private async persistSnapshot(
    reason: string,
    snapshot: GatewayHistorySnapshot,
  ): Promise<void> {
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

  private appendJournal<T extends { at: string }>(
    pathname: string,
    record: T,
  ): T {
    appendFileSync(pathname, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  private computeTransportState(
    platform: PlatformName,
    status: PlatformHealth["status"],
    ready: boolean,
  ): GatewayPlatformState["transportState"] {
    if (status === "running" && ready) {
      return "live";
    }
    if (status === "running") {
      return "degraded";
    }
    if (status === "idle") {
      return LIGHTWEIGHT_WEBHOOK_PLATFORMS.has(platform)
        ? "booting"
        : "inactive";
    }
    return ready ? "paused" : "inactive";
  }

  private splitAttachmentList(value?: string): string[] {
    if (!value) {
      return [];
    }
    return value
      .split(/[|,]/g)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private extractJournalAttachments(
    direction: "inbox" | "outbox",
    platform: PlatformName,
    recordId: string,
    traceId: string,
    base: {
      sessionId?: string;
      deliveryId?: string;
      messageId?: string;
      userId?: string;
      roomId: string;
      threadId?: string;
      replyToMessageId?: string;
      metadata: Record<string, string>;
    },
  ): GatewayAttachmentRecord[] {
    const kinds = this.splitAttachmentList(
      base.metadata.attachmentKinds ?? base.metadata.attachmentKind,
    );
    const names = this.splitAttachmentList(base.metadata.attachmentNames);
    const urls = this.splitAttachmentList(base.metadata.attachmentUrls);
    const mimeTypes = this.splitAttachmentList(
      base.metadata.attachmentMimeTypes,
    );
    const sizes = this.splitAttachmentList(base.metadata.attachmentSizes);
    const captions = this.splitAttachmentList(base.metadata.attachmentCaptions);
    const durations = this.splitAttachmentList(
      base.metadata.attachmentDurationsMs,
    );
    const widths = this.splitAttachmentList(base.metadata.attachmentWidths);
    const heights = this.splitAttachmentList(base.metadata.attachmentHeights);
    const count = Math.max(
      Number(base.metadata.attachmentCount ?? "0") || 0,
      kinds.length,
      names.length,
      urls.length,
      mimeTypes.length,
    );

    return Array.from({ length: count }).map((_, index) => {
      const attachmentKind =
        kinds[index] ??
        names[index] ??
        base.metadata.attachmentType ??
        "attachment";
      const attachment: GatewayAttachmentRecord = {
        attachmentId: `${recordId}:${index + 1}`,
        recordId,
        at: new Date().toISOString(),
        direction,
        platform,
        sessionId: base.sessionId,
        traceId,
        deliveryId: base.deliveryId,
        messageId: base.messageId,
        userId: base.userId,
        roomId: base.roomId,
        threadId: base.threadId,
        replyToMessageId: base.replyToMessageId,
        kind: attachmentKind,
        name: names[index] ?? base.metadata.attachmentName,
        url: urls[index] ?? base.metadata.attachmentUrl,
        mimeType: mimeTypes[index] ?? base.metadata.attachmentMimeType,
        size: sizes[index] ?? base.metadata.attachmentSize,
        caption: captions[index] ?? base.metadata.attachmentCaption,
        durationMs: durations[index] ?? base.metadata.attachmentDurationMs,
        width: widths[index] ?? base.metadata.attachmentWidth,
        height: heights[index] ?? base.metadata.attachmentHeight,
        metadataKeys: Object.keys(base.metadata),
        metadata: base.metadata,
      };
      return attachment;
    });
  }

  private recordInbox(
    message: IncomingPlatformMessage,
    traceId: string,
    sessionId?: string,
    status: GatewayInboxRecord["status"] = "received",
    notes: string[] = [],
  ): GatewayInboxRecord {
    const at = new Date().toISOString();
    const record: GatewayInboxRecord = {
      recordId: randomUUID(),
      at,
      platform: message.platform,
      sessionId,
      traceId,
      status,
      userId: message.userId,
      roomId: message.roomId,
      channelId: message.channelId,
      threadId: message.threadId,
      messageId: message.messageId,
      replyToMessageId: message.replyToMessageId,
      channelType: message.channelType,
      authorName: message.authorName,
      textPreview: message.text.slice(0, 280),
      attachmentCount: Number(message.metadata?.attachmentCount ?? "0") || 0,
      attachmentKinds: this.splitAttachmentList(
        message.metadata?.attachmentKinds,
      ),
      attachmentNames: this.splitAttachmentList(
        message.metadata?.attachmentNames,
      ),
      attachmentUrls: this.splitAttachmentList(
        message.metadata?.attachmentUrls,
      ),
      attachmentMimeTypes: this.splitAttachmentList(
        message.metadata?.attachmentMimeTypes,
      ),
      metadataKeys: Object.keys(message.metadata ?? {}),
      metadata: message.metadata ?? {},
      notes: notes.length > 0 ? notes : undefined,
    };
    this.inboxLog.push(record);
    this.appendJournal(this.inboxPath, record);
    const attachments = this.extractJournalAttachments(
      "inbox",
      message.platform,
      record.recordId,
      traceId,
      {
        sessionId,
        messageId: message.messageId,
        userId: message.userId,
        roomId: message.roomId,
        threadId: message.threadId,
        replyToMessageId: message.replyToMessageId,
        metadata: message.metadata ?? {},
      },
    );
    for (const attachment of attachments) {
      this.attachmentLog.push(attachment);
      this.appendJournal(this.attachmentsPath, attachment);
    }
    this.ensurePlatformState(message.platform).inboxCount += 1;
    const state = this.ensurePlatformState(message.platform);
    state.lastInboundAt = at;
    state.lastReceivedAt = at;
    state.transportState =
      status === "accepted"
        ? state.ready
          ? "live"
          : "degraded"
        : status === "rejected"
          ? "paused"
          : state.transportState;
    if (attachments.length > 0) {
      state.attachmentCount += attachments.length;
      state.lastAttachmentAt = at;
      state.lastAttachmentKind = attachments.at(-1)?.kind;
    }
    return record;
  }

  private recordOutbox(
    platform: PlatformName,
    traceId: string,
    sessionId: string | undefined,
    delivery: DeliveredMessageRecord,
    message: OutboundPlatformMessage,
    status: GatewayOutboxRecord["status"],
  ): GatewayOutboxRecord {
    const at = new Date().toISOString();
    const record: GatewayOutboxRecord = {
      recordId: randomUUID(),
      at,
      platform,
      sessionId,
      traceId,
      status,
      deliveryId: delivery.id,
      userId: message.userId,
      roomId: message.roomId,
      threadId: message.threadId,
      replyToMessageId: message.replyToId,
      textPreview: message.text.slice(0, 280),
      attachmentCount: Number(message.metadata?.attachmentCount ?? "0") || 0,
      attachmentKinds: this.splitAttachmentList(
        message.metadata?.attachmentKinds,
      ),
      attachmentNames: this.splitAttachmentList(
        message.metadata?.attachmentNames,
      ),
      attachmentUrls: this.splitAttachmentList(
        message.metadata?.attachmentUrls,
      ),
      attachmentMimeTypes: this.splitAttachmentList(
        message.metadata?.attachmentMimeTypes,
      ),
      metadataKeys: Object.keys(message.metadata ?? {}),
      metadata: message.metadata ?? {},
    };
    this.outboxLog.push(record);
    this.appendJournal(this.outboxPath, record);
    const attachments = this.extractJournalAttachments(
      "outbox",
      platform,
      record.recordId,
      traceId,
      {
        sessionId,
        deliveryId: delivery.id,
        userId: message.userId,
        roomId: message.roomId,
        threadId: message.threadId,
        replyToMessageId: message.replyToId,
        metadata: message.metadata ?? {},
      },
    );
    for (const attachment of attachments) {
      this.attachmentLog.push(attachment);
      this.appendJournal(this.attachmentsPath, attachment);
    }
    const state = this.ensurePlatformState(platform);
    state.outboxCount += 1;
    state.lastOutboundRoomId = message.roomId;
    state.lastOutboundUserId = message.userId;
    state.lastOutboundThreadId = message.threadId;
    state.lastOutboundReplyToId = message.replyToId;
    state.lastOutboundMetadataKeys = Object.keys(message.metadata ?? {});
    if (attachments.length > 0) {
      state.attachmentCount += attachments.length;
      state.lastAttachmentAt = at;
      state.lastAttachmentKind = attachments.at(-1)?.kind;
    }
    state.lastOutboundAt = at;
    state.lastDeliveryAt = at;
    state.lastDeliveryId = delivery.id;
    state.transportState = state.ready ? "live" : "degraded";
    return record;
  }

  private async collectReadiness(): Promise<PlatformHealth[]> {
    const configuredPlatforms = Object.keys(
      this.context.services.gatewayConfig.platforms,
    ) as PlatformName[];
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
        const mode: PlatformHealth["mode"] = NATIVE_PLATFORM_ADAPTERS.has(
          platform,
        )
          ? "native"
          : "mock";
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
    const inventory = this.getTransportInventoryEntry(health.platform);
    const inventoryDetail = inventory?.detail;
    const detail =
      inventoryDetail && inventoryDetail !== health.detail
        ? `${inventoryDetail} ${health.detail}`
        : (inventoryDetail ?? health.detail);
    const ready = inventory
      ? inventory.operational && health.ready
      : health.ready;
    const lastError =
      health.lastError ??
      (!ready &&
      inventory &&
      inventory.reason !== "live" &&
      inventory.reason !== "custom-ready"
        ? inventory.detail
        : undefined);

    return {
      ...health,
      ready,
      detail,
      lastSendAt: health.lastSendAt ?? state.lastUpdatedAt,
      lastDeliveryAt: health.lastDeliveryAt ?? state.lastDeliveryAt,
      lastDeliveryId: health.lastDeliveryId ?? state.lastDeliveryId,
      lastOutboundRoomId: health.lastOutboundRoomId ?? state.lastOutboundRoomId,
      lastOutboundUserId: health.lastOutboundUserId ?? state.lastOutboundUserId,
      lastOutboundThreadId:
        health.lastOutboundThreadId ?? state.lastOutboundThreadId,
      lastOutboundReplyToId:
        health.lastOutboundReplyToId ?? state.lastOutboundReplyToId,
      lastOutboundMetadataKeys:
        health.lastOutboundMetadataKeys ?? state.lastOutboundMetadataKeys,
      lastReceivedAt: health.lastReceivedAt ?? state.lastReceivedAt,
      lastRoutedAt: health.lastRoutedAt ?? state.lastRoutedAt,
      lastRespondedAt: health.lastRespondedAt ?? state.lastRespondedAt,
      lastHeartbeatAt: health.lastHeartbeatAt ?? state.lastHeartbeatAt,
      sendCount: health.sendCount ?? state.sendCount,
      lastError,
      presence: health.presence ?? state.presence,
      events: health.events,
    };
  }

  private buildStateSnapshot(
    readiness: PlatformHealth[],
    allTraces: GatewayTraceRecord[],
    traces: GatewayTraceRecord[],
    inbox: GatewayInboxRecord[],
    outbox: GatewayOutboxRecord[],
    attachments: GatewayAttachmentRecord[],
    deliveries: DeliveredMessageRecord[],
    sessions: SessionRoute[],
    reason: string,
  ): GatewayStateSnapshot {
    const timestamp = new Date().toISOString();
    const controlPlane = this.getTransportControlPlane();
    const enrichedReadiness = readiness.map((entry) => {
      const nativePlugin = this.resolveNativeMessagingPlugin(entry.platform);
      return {
        ...entry,
        nativePluginId: nativePlugin?.id,
        nativePluginSource: nativePlugin?.source,
        nativePluginEnabled: nativePlugin?.enabled,
        nativePluginNotes: nativePlugin?.notes,
      };
    });
    const platformSummary = enrichedReadiness.map((entry) => {
      const platformTraces = allTraces.filter(
        (trace) => trace.platform === entry.platform,
      );
      const latestTrace = platformTraces.at(-1);
      const state = this.ensurePlatformState(entry.platform);
      const platformInbox = inbox.filter(
        (record) => record.platform === entry.platform,
      );
      const platformOutbox = outbox.filter(
        (record) => record.platform === entry.platform,
      );
      const platformAttachments = attachments.filter(
        (record) => record.platform === entry.platform,
      );
      const latestInbox = platformInbox.at(-1);
      const latestOutbox = platformOutbox.at(-1);
      const latestAttachment = platformAttachments.at(-1);
      return {
        platform: entry.platform,
        nativePluginId: state.nativePluginId,
        nativePluginSource: state.nativePluginSource,
        nativePluginEnabled: state.nativePluginEnabled,
        nativePluginNotes: state.nativePluginNotes,
        status: entry.status,
        mode: entry.mode,
        ready: entry.ready,
        transportState: state.transportState,
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
        lastOutboundAt: latestOutbox?.at ?? state.lastOutboundAt,
        lastReceivedAt: entry.lastReceivedAt ?? state.lastReceivedAt,
        lastInboundAt:
          latestInbox?.at ?? state.lastInboundAt ?? state.lastReceivedAt,
        lastRoutedAt: entry.lastRoutedAt ?? state.lastRoutedAt,
        lastRespondedAt: entry.lastRespondedAt ?? state.lastRespondedAt,
        lastHeartbeatAt: entry.lastHeartbeatAt ?? state.lastHeartbeatAt,
        lastSessionId: state.lastSessionId,
        lastRoomId: state.lastRoomId,
        lastUserId: state.lastUserId,
        lastAttachmentAt: latestAttachment?.at ?? state.lastAttachmentAt,
        lastAttachmentKind: latestAttachment?.kind ?? state.lastAttachmentKind,
        inboxCount: platformInbox.length,
        outboxCount: platformOutbox.length,
        attachmentCount: platformAttachments.length,
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
      heartbeatAt:
        this.platformStates.size > 0
          ? Array.from(this.platformStates.values())
              .map((state) => state.lastHeartbeatAt)
              .filter(Boolean)
              .at(-1)
          : undefined,
      snapshotPath: this.snapshotPath,
      historyPath: this.snapshotHistoryPath,
      totals: {
        configuredPlatforms: readiness.length,
        activeAdapters: enrichedReadiness.filter(
          (entry) => entry.status === "running",
        ).length,
        readyAdapters: enrichedReadiness.filter((entry) => entry.ready).length,
        gatewayEnabledTransports: controlPlane.totals.gatewayEnabled,
        operationalTransports: controlPlane.totals.operationalTransports,
        nativeAdapters: enrichedReadiness.filter(
          (entry) => entry.mode === "native",
        ).length,
        mockAdapters: enrichedReadiness.filter((entry) => entry.mode === "mock")
          .length,
        pluginMediatedAdapters: platformSummary.filter((entry) =>
          Boolean(entry.nativePluginId),
        ).length,
        officialPluginAdapters: platformSummary.filter(
          (entry) => entry.nativePluginSource === "official",
        ).length,
        vendoredPluginAdapters: platformSummary.filter(
          (entry) => entry.nativePluginSource === "vendored",
        ).length,
        totalTraces: allTraces.length,
        recentTraces: traces.length,
        inboxMessages: inbox.length,
        outboxMessages: outbox.length,
        attachmentRecords: attachments.length,
        recentDeliveries: deliveries.length,
        recentSessions: sessions.length,
      },
      platforms: platformSummary,
      tracesByKind: this.countByKind(allTraces, (trace) => trace.kind),
      tracesByPlatform: this.countByPlatform(
        allTraces,
        (trace) => trace.platform,
      ),
      inboxByPlatform: this.countByPlatform(inbox, (record) => record.platform),
      outboxByPlatform: this.countByPlatform(
        outbox,
        (record) => record.platform,
      ),
      attachmentsByPlatform: this.countByPlatform(
        attachments,
        (record) => record.platform,
      ),
      attachmentsByKind: this.countByString(
        attachments,
        (record) => record.kind,
      ),
      deliveriesByPlatform: this.countByPlatform(
        deliveries,
        (delivery) => delivery.target.platform,
      ),
      sessionsByPlatform: this.countByPlatform(
        sessions,
        (session) => session.platform,
      ),
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const gatewayConfig = loadGatewayConfig(this.context.config);
    for (const [platform, platformConfig] of Object.entries(
      gatewayConfig.platforms,
    )) {
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
    this.startedAt = new Date().toISOString();
    this.stoppedAt = undefined;
    this.writeRuntimeStatus();
    await this.context.services.hooks.emit("gateway:startup", {
      platforms: Array.from(this.adapters.keys()).join(","),
    });
    if (!this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        void this.heartbeat("interval");
      }, 60_000);
      this.heartbeatInterval.unref?.();
    }
    if (!this.supervisionInterval) {
      this.supervisionInterval = setInterval(() => {
        void this.supervise("interval");
      }, 45_000);
      this.supervisionInterval.unref?.();
    }
    await this.heartbeat("startup");
    await this.supervise("startup");
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
    if (platform === "mattermost") {
      return new MattermostPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "homeassistant") {
      return new HomeAssistantPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "dingtalk") {
      return new DingtalkPlatformAdapter(
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
    if (this.supervisionInterval) {
      clearInterval(this.supervisionInterval);
      this.supervisionInterval = null;
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
    this.stoppedAt = new Date().toISOString();
    this.writeRuntimeStatus();
    await this.context.services.hooks.emit("gateway:shutdown", {
      status: "stopped",
    });
    await this.snapshotState("stop", 20);
    this.adapters.clear();
  }

  async heartbeat(reason = "heartbeat"): Promise<GatewayStateSnapshot> {
    const heartbeatAt = new Date().toISOString();
    this.lastHeartbeatAt = heartbeatAt;
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
    this.writeRuntimeStatus();
    const snapshot = await this.snapshotState(reason, 20);
    return snapshot.state;
  }

  runtimeStatus(): GatewayRuntimeStatus {
    const controlPlane = this.getTransportControlPlane();
    return {
      pid: process.pid,
      running: this.running,
      updatedAt: new Date().toISOString(),
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastSupervisionAt: this.lastSupervisionAt,
      supervisionEvents: this.supervisionLog.length,
      adapters: Array.from(this.adapters.keys()),
      transportControl: controlPlane.totals,
      messagingBridge: controlPlane.messagingBridge,
      transportInventory: controlPlane.transportInventory,
    };
  }

  async supervise(reason = "manual"): Promise<GatewaySupervisionRecord[]> {
    const records: GatewaySupervisionRecord[] = [];
    for (const [platform, adapter] of this.adapters.entries()) {
      const health = await adapter.health();
      if (health.ready) {
        records.push(
          this.recordSupervision(
            platform,
            "health",
            `${platform} healthy during ${reason}.`,
          ),
        );
        if (platform === "homeassistant") {
          records.push(
            this.recordSupervision(
              platform,
              "watch",
              `Home Assistant watcher cycle acknowledged during ${reason}.`,
            ),
          );
        }
        continue;
      }

      if (health.status === "running" || health.status === "idle") {
        try {
          await adapter.stop();
          await adapter.start();
          records.push(
            this.recordSupervision(
              platform,
              "restart",
              `${platform} adapter restart attempted during ${reason}.`,
            ),
          );
        } catch (error) {
          records.push(
            this.recordSupervision(
              platform,
              "recover",
              `${platform} recovery failed during ${reason}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      } else {
        records.push(
          this.recordSupervision(
            platform,
            "skip",
            `${platform} supervision skipped during ${reason}; adapter status ${health.status}.`,
          ),
        );
      }
    }

    this.lastSupervisionAt = new Date().toISOString();
    this.writeRuntimeStatus();
    await this.snapshotState(`supervise:${reason}`, 20);
    return records;
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
      this.recordInbox(message, traceId, undefined, "rejected", [
        `${message.platform} transport is not ready for inbound traffic.`,
      ]);
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
    const auth = authorizeMessage(
      message,
      gatewayConfig,
      this.context.services.pairing,
    );
    if (!auth.allowed) {
      const response = auth.pairingCode
        ? `Authorization required. Pairing code: ${auth.pairingCode}`
        : (auth.reason ?? "Unauthorized");
      this.recordInbox(message, traceId, undefined, "rejected", [
        auth.reason ?? "Authorization failed.",
      ]);
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
    this.recordInbox(message, traceId, session.sessionKey, "accepted");
    await this.context.services.hooks.emit("session:start", {
      platform: message.platform,
      userId: message.userId,
      sessionId: session.sessionKey,
    });

    const response = await handleAgentTurn(
      {
        message: message.text,
        userId: message.userId,
        roomId: session.activeAgentSessionId ?? session.sessionKey,
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
      const outbound = await this.buildOutboundResponse(session, message, {
        roomId: message.channelId ?? message.roomId,
        userId: message.userId,
        text: response,
        threadId: message.threadId ?? session.threadId,
        replyToId: message.messageId ?? message.replyToMessageId,
        metadata: message.metadata,
      });
      try {
        const delivery = await adapter.send(outbound);
        deliveryId = delivery.id;
        this.recordOutbox(
          message.platform,
          traceId,
          session.sessionKey,
          delivery,
          outbound,
          "sent",
        );
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
        const detail =
          error instanceof Error
            ? error.message
            : `Delivery via ${adapter.name} failed.`;
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
      const outbound = await this.buildOutboundResponse(session, message, {
        roomId: message.channelId ?? message.roomId,
        userId: message.userId,
        text: response,
        threadId: message.threadId,
        replyToId: message.replyToMessageId,
        metadata: message.metadata,
      });
      const delivery = this.context.services.delivery.deliver(
        {
          platform: message.platform,
          channelId: outbound.roomId,
          userId: message.userId,
          mode: "origin",
        },
        outbound.text,
        {
          threadId: outbound.threadId,
          replyToId: outbound.replyToId,
          metadata: outbound.metadata,
        },
      );
      deliveryId = delivery.id;
      this.recordOutbox(
        message.platform,
        traceId,
        session.sessionKey,
        delivery,
        outbound,
        "fallback",
      );
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

  async sendToHomes(
    text: string,
    options?: {
      metadata?: Record<string, string>;
      platforms?: PlatformName[];
      name?: string;
    },
  ): Promise<DeliveredMessageRecord[]> {
    const deliveries: DeliveredMessageRecord[] = [];
    const platforms = options?.platforms?.length
      ? new Set(options.platforms)
      : null;
    const homeSessions = this.context.services.gatewaySessions
      .list()
      .filter(
        (session) =>
          session.isHome &&
          (!platforms || platforms.has(session.platform)) &&
          (session.channelId ?? session.roomId),
      );

    for (const session of homeSessions) {
      const traceId = randomUUID();
      const outbound = await this.buildOutboundForSession(
        session,
        {
          roomId: session.channelId ?? session.roomId,
          userId: session.userId,
          text,
          threadId: session.threadId,
          replyToId: session.replyToMessageId,
          metadata: options?.metadata,
        },
        options?.name ?? "home-delivery",
      );
      const adapter = this.adapters.get(session.platform);
      const delivery = adapter
        ? await adapter.send(outbound)
        : this.context.services.delivery.deliver(
            {
              platform: session.platform,
              channelId: outbound.roomId,
              userId: session.userId,
              mode: "home",
            },
            outbound.text,
            {
              threadId: outbound.threadId,
              replyToId: outbound.replyToId,
              metadata: outbound.metadata,
            },
          );
      deliveries.push(delivery);
      this.recordOutbox(
        session.platform,
        traceId,
        session.sessionKey,
        delivery,
        outbound,
        adapter ? "sent" : "fallback",
      );
      this.pushTrace({
        traceId,
        at: new Date().toISOString(),
        kind: "deliver",
        platform: session.platform,
        detail: `Delivered to home channel ${outbound.roomId} with record ${delivery.id}.`,
        sessionId: session.sessionKey,
        userId: session.userId,
        roomId: session.roomId,
        threadId: outbound.threadId,
        replyToMessageId: outbound.replyToId,
        deliveryId: delivery.id,
        metadataKeys: Object.keys(delivery.metadata ?? {}),
      });
    }

    return deliveries;
  }

  async editDelivery(
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ): Promise<DeliveredMessageRecord> {
    const delivery = this.context.services.delivery.get(deliveryId);
    if (!delivery) {
      throw new Error(`Delivery ${deliveryId} was not found.`);
    }

    const platform = delivery.target.platform;
    const traceId = randomUUID();
    const session = this.outboxLog
      .slice()
      .reverse()
      .find((record) => record.deliveryId === deliveryId);
    const message = this.buildOutboundMessageFromDelivery(delivery, text, {
      metadata: options?.metadata,
      threadId: options?.threadId,
      replyToId: options?.replyToId,
    });
    const adapter = this.adapters.get(platform);
    const updated = adapter?.edit
      ? await adapter.edit(delivery, message)
      : this.context.services.delivery.update(delivery.id, message.text, {
          threadId: message.threadId,
          replyToId: message.replyToId,
          metadata: {
            ...(delivery.metadata ?? {}),
            ...(message.metadata ?? {}),
            editedLocally: "true",
          },
        });

    this.recordOutbox(
      platform,
      traceId,
      session?.sessionId,
      updated,
      message,
      "edited",
    );
    this.pushTrace({
      traceId,
      at: new Date().toISOString(),
      kind: "update",
      platform,
      detail: `Updated delivery ${deliveryId} on ${platform}.`,
      sessionId: session?.sessionId,
      userId: message.userId,
      roomId: message.roomId,
      threadId: message.threadId,
      replyToMessageId: message.replyToId,
      deliveryId: updated.id,
      metadataKeys: Object.keys(updated.metadata ?? {}),
    });
    await this.observeAdapter(platform, {
      at: new Date().toISOString(),
      kind: "edit",
      detail: `Updated delivery ${deliveryId} on ${platform}.`,
    });
    await this.snapshotState("edit", 20);
    return updated;
  }

  async sendProgressive(
    target: {
      platform: PlatformName;
      roomId: string;
      userId?: string;
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
    },
    parts: string[],
  ): Promise<DeliveredMessageRecord> {
    const [first, ...rest] = parts.map((part) => part.trim()).filter(Boolean);
    if (!first) {
      throw new Error(
        "Progressive delivery requires at least one message part.",
      );
    }

    const adapter = this.adapters.get(target.platform);
    const traceId = randomUUID();
    const initialMessage: OutboundPlatformMessage = {
      roomId: target.roomId,
      userId: target.userId,
      text: first,
      threadId: target.threadId,
      replyToId: target.replyToId,
      metadata: {
        ...(target.metadata ?? {}),
        progressive: "true",
        progressiveStep: "1",
        progressiveTotal: String(rest.length + 1),
      },
    };
    let delivery = adapter
      ? await adapter.send(initialMessage)
      : this.context.services.delivery.deliver(
          {
            platform: target.platform,
            channelId: target.roomId,
            userId: target.userId,
            mode: "explicit",
          },
          initialMessage.text,
          {
            threadId: initialMessage.threadId,
            replyToId: initialMessage.replyToId,
            metadata: initialMessage.metadata,
          },
        );

    this.recordOutbox(
      target.platform,
      traceId,
      undefined,
      delivery,
      initialMessage,
      adapter ? "sent" : "fallback",
    );
    this.pushTrace({
      traceId,
      at: new Date().toISOString(),
      kind: "deliver",
      platform: target.platform,
      detail: `Started progressive delivery ${delivery.id} on ${target.platform}.`,
      userId: target.userId,
      roomId: target.roomId,
      threadId: target.threadId,
      replyToMessageId: target.replyToId,
      deliveryId: delivery.id,
      metadataKeys: Object.keys(delivery.metadata ?? {}),
    });

    for (const [index, part] of rest.entries()) {
      delivery = await this.editDelivery(delivery.id, part, {
        threadId: target.threadId,
        replyToId: target.replyToId,
        metadata: {
          ...(target.metadata ?? {}),
          progressive: "true",
          progressiveStep: String(index + 2),
          progressiveTotal: String(rest.length + 1),
        },
      });
    }

    return delivery;
  }

  async health(): Promise<Array<PlatformHealth>> {
    const snapshot = await this.snapshotState("health", 20);
    return snapshot.readiness;
  }

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.filteredTraces(filters).slice(-limit).reverse();
  }

  async state(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayStateSnapshot> {
    return (await this.history(limit, filters)).state;
  }

  async history(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    return this.snapshotState("history", limit, filters);
  }

  inbox(limit = 20, filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.filteredInbox(filters).slice(-limit).reverse();
  }

  outbox(limit = 20, filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return this.filteredOutbox(filters).slice(-limit).reverse();
  }

  attachments(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.filteredAttachments(filters).slice(-limit).reverse();
  }

  supervision(limit = 20): GatewaySupervisionRecord[] {
    return this.supervisionLog.slice(-limit).reverse();
  }

  async replayInbox(recordId: string): Promise<{
    ok: boolean;
    response: string;
    pairingCode?: string;
    traceId?: string;
    sessionId?: string;
    deliveryId?: string;
  }> {
    const record = this.inboxLog.find((entry) => entry.recordId === recordId);
    if (!record) {
      throw new Error(`Inbox record ${recordId} was not found.`);
    }

    return this.receive({
      platform: record.platform,
      userId: record.userId,
      roomId: record.roomId,
      text: record.textPreview,
      channelId: record.channelId,
      threadId: record.threadId,
      messageId: record.messageId,
      replyToMessageId: record.replyToMessageId,
      channelType: record.channelType,
      authorName: record.authorName,
      timestamp: record.at,
      metadata: {
        ...(record.metadata ?? {}),
        replayedFromRecordId: record.recordId,
        replayedAt: new Date().toISOString(),
      },
    });
  }

  private async snapshotState(
    reason: string,
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    const readiness = await this.collectReadiness();
    const allTraces = this.filteredTraces(filters);
    const traces = allTraces.slice(-limit).reverse();
    const inbox = this.filteredInbox(filters).slice(-limit).reverse();
    const outbox = this.filteredOutbox(filters).slice(-limit).reverse();
    const attachments = this.filteredAttachments(filters)
      .slice(-limit)
      .reverse();
    const deliveries = this.recentDeliveries(limit, filters?.platform);
    const sessions = this.recentSessions(limit, filters?.platform);
    const state = this.buildStateSnapshot(
      readiness,
      allTraces,
      traces,
      inbox,
      outbox,
      attachments,
      deliveries,
      sessions,
      reason,
    );
    const snapshot: GatewayHistorySnapshot = {
      updatedAt: state.updatedAt,
      reason,
      snapshotPath: this.snapshotPath,
      historyPath: this.snapshotHistoryPath,
      readiness,
      traces,
      inbox,
      outbox,
      attachments,
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

  private filteredInbox(filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.inboxLog.filter((record) => {
      if (filters?.platform && record.platform !== filters.platform) {
        return false;
      }
      if (filters?.sessionId && record.sessionId !== filters.sessionId) {
        return false;
      }
      return true;
    });
  }

  private filteredOutbox(
    filters?: GatewayHistoryFilter,
  ): GatewayOutboxRecord[] {
    return this.outboxLog.filter((record) => {
      if (filters?.platform && record.platform !== filters.platform) {
        return false;
      }
      if (filters?.sessionId && record.sessionId !== filters.sessionId) {
        return false;
      }
      return true;
    });
  }

  private filteredAttachments(
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.attachmentLog.filter((record) => {
      if (filters?.platform && record.platform !== filters.platform) {
        return false;
      }
      if (filters?.sessionId && record.sessionId !== filters.sessionId) {
        return false;
      }
      return true;
    });
  }

  private recentDeliveries(
    limit = 20,
    platform?: PlatformName,
  ): DeliveredMessageRecord[] {
    const records = this.context.services.delivery.recent(
      Math.max(limit * 4, 50),
    );
    const filtered = platform
      ? records.filter((record) => record.target.platform === platform)
      : records;
    return filtered.slice(0, limit);
  }

  private recentSessions(limit = 20, platform?: PlatformName): SessionRoute[] {
    const sessions = this.context.services.gatewaySessions
      .list()
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const filtered = platform
      ? sessions.filter((session) => session.platform === platform)
      : sessions;
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
    const counts = new Map<
      GatewayTraceRecord["kind"],
      { kind: GatewayTraceRecord["kind"]; count: number }
    >();
    for (const record of records) {
      const key = selector(record);
      const existing = counts.get(key) ?? { kind: key, count: 0 };
      existing.count += 1;
      counts.set(key, existing);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }

  private countByString<T>(
    records: T[],
    selector: (record: T) => string,
  ): Array<{ kind: string; count: number }> {
    const counts = new Map<string, { kind: string; count: number }>();
    for (const record of records) {
      const key = selector(record);
      const existing = counts.get(key) ?? { kind: key, count: 0 };
      existing.count += 1;
      counts.set(key, existing);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }

  private isVoiceMessage(message: IncomingPlatformMessage): boolean {
    const kinds = (message.metadata?.attachmentKinds ?? "")
      .split("|")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return kinds.some((kind) => kind === "voice" || kind === "audio");
  }

  private async buildOutboundResponse(
    session: SessionRoute,
    message: IncomingPlatformMessage,
    outbound: OutboundPlatformMessage,
  ): Promise<OutboundPlatformMessage> {
    const voiceMode = session.voiceMode ?? "off";
    const shouldSpeak =
      voiceMode === "all" ||
      (voiceMode === "voice_only" && this.isVoiceMessage(message));
    if (!shouldSpeak) {
      return outbound;
    }
    return this.buildOutboundForSession(session, outbound, "voice-reply");
  }

  private async buildOutboundForSession(
    session: SessionRoute,
    outbound: OutboundPlatformMessage,
    speechName: string,
  ): Promise<OutboundPlatformMessage> {
    const voiceMode = session.voiceMode ?? "off";
    if (voiceMode === "off") {
      return outbound;
    }

    try {
      const speech = await this.context.services.media.speak(outbound.text, {
        name: `${session.platform}-${speechName}`,
      });
      const attachmentName = speech.artifactPath.split("/").at(-1) ?? "speech";
      return {
        ...outbound,
        metadata: {
          ...(outbound.metadata ?? {}),
          voiceMode,
          audioAsVoice: "true",
          attachmentCount: "1",
          attachmentKinds: "voice",
          attachmentNames: attachmentName,
          attachmentUrls: speech.artifactPath,
          attachmentMimeTypes:
            speech.artifactKind === "mp3" ? "audio/mpeg" : "image/svg+xml",
        },
      };
    } catch {
      return {
        ...outbound,
        metadata: {
          ...(outbound.metadata ?? {}),
          voiceMode,
          audioAsVoice: "true",
        },
      };
    }
  }

  private buildOutboundMessageFromDelivery(
    delivery: DeliveredMessageRecord,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ): OutboundPlatformMessage {
    return {
      roomId: delivery.target.channelId ?? delivery.target.userId ?? "unknown",
      userId: delivery.target.userId,
      text,
      threadId: options?.threadId ?? delivery.threadId,
      replyToId: options?.replyToId ?? delivery.replyToId,
      metadata: {
        ...(delivery.metadata ?? {}),
        ...(options?.metadata ?? {}),
      },
    };
  }

  private describeInactivePlatform(platform: PlatformName): string {
    const platformConfig =
      this.context.services.gatewayConfig.platforms[platform];
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
    this.events.emit("update", {
      kind: entry.kind,
      platform: entry.platform,
      detail: entry.detail,
    });
  }

  private recordSupervision(
    platform: PlatformName | "gateway",
    action: GatewaySupervisionRecord["action"],
    detail: string,
  ): GatewaySupervisionRecord {
    const record: GatewaySupervisionRecord = {
      at: new Date().toISOString(),
      platform,
      action,
      detail,
    };
    this.supervisionLog.push(record);
    if (this.supervisionLog.length > 200) {
      this.supervisionLog.splice(0, this.supervisionLog.length - 200);
    }
    this.appendJournal(this.supervisionPath, record);
    this.events.emit("update", {
      kind: "lifecycle",
      platform,
      detail,
    });
    return record;
  }

  onUpdate(
    listener: (event: {
      kind: GatewayTraceRecord["kind"];
      platform: GatewayTraceRecord["platform"];
      detail: string;
    }) => void,
  ): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  private writeRuntimeStatus(): void {
    writeFileSync(
      this.runtimeStatusPath,
      JSON.stringify(this.runtimeStatus(), null, 2),
      "utf8",
    );
  }
}
