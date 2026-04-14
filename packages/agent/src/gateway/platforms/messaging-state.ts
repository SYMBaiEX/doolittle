import type { NativeMessagingTransportState } from "@/runtime/native/service-bridge/transport-control";
import type {
  DeliveredMessageRecord,
  OutboundPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import {
  buildConfiguredTransportHealth,
  capabilitiesForPlatform,
  createLifecycleHistory,
  describeTransportHealth,
  nowIso,
  type PlatformHealth,
  type PlatformLifecycleEvent,
  trackTransportStart,
} from "./base";

interface MessagingStartOptions {
  configured: boolean;
  startedDetail: string;
  missingDetail: string;
}

interface MessagingHealthOptions {
  configured: boolean;
  canReceive: boolean;
  configuredDetail: string;
  missingDetail: string;
  runningDetail: string;
  stoppedDetail: string;
  bridge?: NativeMessagingTransportState;
}

interface MessagingRecordOptions {
  kind: "deliver" | "edit";
  detail: string;
  message: OutboundPlatformMessage;
  record: DeliveredMessageRecord;
}

export class MessagingPlatformState {
  private status: "idle" | "running" | "stopped" = "idle";
  private startedAt?: string;
  private stoppedAt?: string;
  private lastSendAt?: string;
  private lastDeliveryAt?: string;
  private lastDeliveryId?: string;
  private lastOutboundRoomId?: string;
  private lastOutboundUserId?: string;
  private lastOutboundThreadId?: string;
  private lastOutboundReplyToId?: string;
  private lastOutboundMetadataKeys?: string[];
  private sendCount = 0;
  private lastError?: string;
  private readonly lifecycle = createLifecycleHistory();

  constructor(private readonly name: PlatformName) {}

  getSendCount(): number {
    return this.sendCount;
  }

  start(options: MessagingStartOptions): void {
    const started = trackTransportStart(
      this.name,
      options.configured,
      options.startedDetail,
      options.missingDetail,
      this.lifecycle,
    );
    this.status = started.status;
    this.startedAt = started.startedAt;
    this.lastError = started.lastError;
  }

  stop(detail: string): void {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", detail);
  }

  health(options: MessagingHealthOptions): PlatformHealth {
    const ready =
      this.status === "running" &&
      options.canReceive &&
      (options.bridge ? options.bridge.ready : true);
    this.lifecycle.record(
      "health",
      describeTransportHealth(this.name, this.status, this.sendCount, ready),
    );
    const health = buildConfiguredTransportHealth({
      platform: this.name,
      status: this.status,
      sendCount: this.sendCount,
      configured: options.configured,
      readyWhenRunning: options.bridge ? options.bridge.ready : true,
      configuredDetail: options.configuredDetail,
      missingDetail: options.missingDetail,
      runningDetail: options.runningDetail,
      stoppedDetail: options.stoppedDetail,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastSendAt: this.lastSendAt,
      lastDeliveryAt: this.lastDeliveryAt,
      lastDeliveryId: this.lastDeliveryId,
      lastOutboundRoomId: this.lastOutboundRoomId,
      lastOutboundUserId: this.lastOutboundUserId,
      lastOutboundThreadId: this.lastOutboundThreadId,
      lastOutboundReplyToId: this.lastOutboundReplyToId,
      lastOutboundMetadataKeys: this.lastOutboundMetadataKeys,
      lastError: this.lastError,
      events: this.lifecycle.recent(6),
      capabilities: capabilitiesForPlatform(this.name),
    });
    return {
      ...health,
      nativePluginId: options.bridge?.pluginId,
      nativePluginSource: options.bridge?.pluginSource,
      nativePluginEnabled: options.bridge?.pluginEnabled,
      nativePluginNotes: options.bridge
        ? `${options.bridge.summary}; ${options.bridge.detail}`
        : undefined,
    };
  }

  fail(detail: string): never {
    this.lastError = detail;
    this.lifecycle.record("error", detail);
    throw new Error(detail);
  }

  recordDelivery(options: MessagingRecordOptions): void {
    this.sendCount += 1;
    this.lastSendAt = nowIso();
    this.lastError = undefined;
    this.lastOutboundRoomId = options.message.roomId;
    this.lastOutboundUserId = options.message.userId;
    this.lastOutboundThreadId = options.message.threadId;
    this.lastOutboundReplyToId = options.message.replyToId;
    this.lastOutboundMetadataKeys = Object.keys(options.message.metadata ?? {});
    this.lastDeliveryAt = nowIso();
    this.lastDeliveryId = options.record.id;
    this.lifecycle.record(options.kind, options.detail);
  }

  observe(event: PlatformLifecycleEvent): void {
    this.lifecycle.record(event.kind, event.detail);
    if (event.kind === "error" || event.kind === "reject") {
      this.lastError = event.detail;
    }
  }
}
