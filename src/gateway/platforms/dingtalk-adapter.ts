import type { DeliveryService } from "@/services/delivery-service";
import type { EnvConfig, OutboundPlatformMessage, PlatformName } from "@/types";
import {
  capabilitiesForPlatform,
  createLifecycleHistory,
  nowIso,
  type PlatformAdapter,
  type PlatformHealth,
  type PlatformLifecycleEvent,
} from "./base";

export class DingtalkPlatformAdapter implements PlatformAdapter {
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

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status =
      this.config.dingtalkWebhookUrl || this.config.dingtalkAccessToken
        ? "running"
        : "stopped";
    if (this.status === "running") {
      this.startedAt = nowIso();
      this.lastError = undefined;
      this.lifecycle.record(
        "start",
        "DingTalk adapter started with webhook or access token configuration.",
      );
    } else {
      this.lastError =
        "DINGTALK_WEBHOOK_URL or DINGTALK_ACCESS_TOKEN is required.";
      this.lifecycle.record("error", this.lastError);
    }
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", "DingTalk adapter stopped.");
  }

  async health(): Promise<PlatformHealth> {
    this.lifecycle.record(
      "health",
      `DingTalk health check: status=${this.status} sends=${this.sendCount}.`,
    );
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running" && this.canReceive(),
      mode: "native",
      capabilities: capabilitiesForPlatform(this.name),
      detail:
        this.config.dingtalkWebhookUrl || this.config.dingtalkAccessToken
          ? "DingTalk webhook or access token configured."
          : "DINGTALK_WEBHOOK_URL or DINGTALK_ACCESS_TOKEN should be configured.",
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
      lastError: this.lastError,
      events: this.lifecycle.recent(6),
    };
  }

  async send(message: OutboundPlatformMessage) {
    const baseUrl = this.config.dingtalkWebhookUrl;
    if (!baseUrl) {
      this.lastError = "DINGTALK_WEBHOOK_URL is required for outbound sends.";
      this.lifecycle.record("error", this.lastError);
      throw new Error(this.lastError);
    }

    const url =
      this.config.dingtalkAccessToken && !baseUrl.includes("access_token=")
        ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(this.config.dingtalkAccessToken)}`
        : baseUrl;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        msgtype: "text",
        text: {
          content: message.text,
        },
      }),
    });

    if (!response.ok) {
      this.lastError = `DingTalk send failed (${response.status}): ${await response.text()}`;
      this.lifecycle.record("error", this.lastError);
      throw new Error(this.lastError);
    }

    this.sendCount += 1;
    this.lastSendAt = nowIso();
    this.lastError = undefined;
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
      `DingTalk delivery ${record.id} to ${message.roomId}.`,
    );
    return record;
  }

  canReceive(): boolean {
    return Boolean(
      this.config.dingtalkWebhookUrl || this.config.dingtalkAccessToken,
    );
  }

  observe(event: PlatformLifecycleEvent): void {
    this.lifecycle.record(event.kind, event.detail);
    if (event.kind === "error" || event.kind === "reject") {
      this.lastError = event.detail;
    }
  }
}
