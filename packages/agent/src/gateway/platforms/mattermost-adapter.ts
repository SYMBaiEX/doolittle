import { randomUUID } from "node:crypto";
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

export class MattermostPlatformAdapter implements PlatformAdapter {
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
      this.config.mattermostUrl && this.config.mattermostToken
        ? "running"
        : "stopped";
    if (this.status === "running") {
      this.startedAt = nowIso();
      this.lastError = undefined;
      this.lifecycle.record(
        "start",
        "Mattermost adapter started with server URL and bot token.",
      );
    } else {
      this.lastError = "MATTERMOST_URL and MATTERMOST_TOKEN are required.";
      this.lifecycle.record("error", this.lastError);
    }
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", "Mattermost adapter stopped.");
  }

  async health(): Promise<PlatformHealth> {
    this.lifecycle.record(
      "health",
      `Mattermost health check: status=${this.status} sends=${this.sendCount}.`,
    );
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running" && this.canReceive(),
      mode: "native",
      capabilities: capabilitiesForPlatform(this.name),
      detail:
        this.config.mattermostUrl && this.config.mattermostToken
          ? `Mattermost server configured at ${this.config.mattermostUrl}.`
          : "MATTERMOST_URL and MATTERMOST_TOKEN should both be configured.",
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
    if (!this.config.mattermostUrl || !this.config.mattermostToken) {
      this.lastError = "MATTERMOST_URL and MATTERMOST_TOKEN are required.";
      this.lifecycle.record("error", this.lastError);
      throw new Error(this.lastError);
    }

    const url = `${this.config.mattermostUrl.replace(/\/$/u, "")}/api/v4/posts`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.mattermostToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        channel_id: message.roomId,
        message: message.text,
        root_id: message.threadId || message.replyToId,
        props: Object.keys(message.metadata ?? {}).length
          ? message.metadata
          : undefined,
        pending_post_id: randomUUID(),
      }),
    });

    if (!response.ok) {
      this.lastError = `Mattermost send failed (${response.status}): ${await response.text()}`;
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
      `Mattermost delivery ${record.id} to ${message.roomId}.`,
    );
    return record;
  }

  canReceive(): boolean {
    return Boolean(this.config.mattermostUrl && this.config.mattermostToken);
  }

  observe(event: PlatformLifecycleEvent): void {
    this.lifecycle.record(event.kind, event.detail);
    if (event.kind === "error" || event.kind === "reject") {
      this.lastError = event.detail;
    }
  }
}
