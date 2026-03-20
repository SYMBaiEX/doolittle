import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage, PlatformName } from "@/types";
import {
  capabilitiesForPlatform,
  createLifecycleHistory,
  nowIso,
  type PlatformAdapter,
  type PlatformHealth,
  type PlatformLifecycleEvent,
} from "./base";

export class MockPlatformAdapter implements PlatformAdapter {
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
  private readonly lifecycle = createLifecycleHistory();

  constructor(
    public readonly name: PlatformName,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status = "running";
    this.startedAt = nowIso();
    this.lifecycle.record("start", `${this.name} mock adapter started.`);
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", `${this.name} mock adapter stopped.`);
  }

  async health(): Promise<PlatformHealth> {
    const capabilities = capabilitiesForPlatform(this.name);
    this.lifecycle.record(
      "health",
      `${this.name} mock adapter health check: status=${this.status} sends=${this.sendCount}.`,
    );
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running",
      mode: "mock",
      capabilities,
      detail: `${this.name} mock adapter active for local native experience scaffolding. Inbound=${capabilities.inbound}, replies=${capabilities.replies}, threads=${capabilities.threads}.`,
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
      sendCount: this.sendCount,
      lastError: undefined,
      events: this.lifecycle.recent(6),
    };
  }

  async send(message: OutboundPlatformMessage) {
    this.sendCount += 1;
    this.lastSendAt = nowIso();
    this.lastOutboundRoomId = message.roomId;
    this.lastOutboundUserId = message.userId;
    this.lastOutboundThreadId = message.threadId;
    this.lastOutboundReplyToId = message.replyToId;
    this.lastOutboundMetadataKeys = Object.keys(message.metadata ?? {});
    const record = this.delivery.deliver(
      {
        platform: this.name,
        channelId: message.roomId,
        userId: message.userId,
        mode: "explicit",
      },
      message.text,
      {
        threadId: message.threadId,
        replyToId: message.replyToId,
        metadata: message.metadata,
      },
    );
    this.lastDeliveryAt = nowIso();
    this.lastDeliveryId = record.id;
    this.lifecycle.record(
      "deliver",
      `Recorded mock delivery ${record.id} to ${message.roomId}${message.threadId ? ` thread=${message.threadId}` : ""}${message.replyToId ? ` replyTo=${message.replyToId}` : ""}.`,
    );
    return record;
  }

  async edit(
    delivery: ReturnType<DeliveryService["deliver"]>,
    message: OutboundPlatformMessage,
  ) {
    this.lastSendAt = nowIso();
    this.lastOutboundRoomId = message.roomId;
    this.lastOutboundUserId = message.userId;
    this.lastOutboundThreadId = message.threadId;
    this.lastOutboundReplyToId = message.replyToId;
    this.lastOutboundMetadataKeys = Object.keys(message.metadata ?? {});
    const updated = this.delivery.update(delivery.id, message.text, {
      threadId: message.threadId,
      replyToId: message.replyToId,
      metadata: message.metadata,
    });
    this.lastDeliveryAt = nowIso();
    this.lastDeliveryId = updated.id;
    this.lifecycle.record(
      "edit",
      `Updated mock delivery ${updated.id} in ${message.roomId}${message.threadId ? ` thread=${message.threadId}` : ""}${message.replyToId ? ` replyTo=${message.replyToId}` : ""}.`,
    );
    return updated;
  }

  canReceive(): boolean {
    return true;
  }

  observe(event: PlatformLifecycleEvent): void {
    this.lifecycle.record(event.kind, event.detail);
  }
}
