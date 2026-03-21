import { randomUUID } from "node:crypto";
import type { DeliveryService } from "@/services/delivery-service";
import type { EnvConfig, OutboundPlatformMessage, PlatformName } from "@/types";
import {
  buildConfiguredTransportHealth,
  capabilitiesForPlatform,
  createLifecycleHistory,
  describeTransportHealth,
  nowIso,
  type PlatformAdapter,
  type PlatformHealth,
  type PlatformLifecycleEvent,
  trackTransportStart,
} from "./base";

export class MatrixPlatformAdapter implements PlatformAdapter {
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
    const configured = Boolean(
      this.config.matrixHomeserver && this.config.matrixAccessToken,
    );
    const started = trackTransportStart(
      this.name,
      configured,
      "Matrix adapter started with homeserver and access token.",
      "MATRIX_HOMESERVER and MATRIX_ACCESS_TOKEN are required.",
      this.lifecycle,
    );
    this.status = started.status;
    this.startedAt = started.startedAt;
    this.lastError = started.lastError;
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", "Matrix adapter stopped.");
  }

  async health(): Promise<PlatformHealth> {
    const ready = this.status === "running" && this.canReceive();
    this.lifecycle.record(
      "health",
      describeTransportHealth(this.name, this.status, this.sendCount, ready),
    );
    return buildConfiguredTransportHealth({
      platform: this.name,
      status: this.status,
      sendCount: this.sendCount,
      configured: Boolean(
        this.config.matrixHomeserver && this.config.matrixAccessToken,
      ),
      configuredDetail: `Matrix homeserver configured at ${this.config.matrixHomeserver}.`,
      missingDetail:
        "MATRIX_HOMESERVER and MATRIX_ACCESS_TOKEN should both be configured.",
      runningDetail: `Matrix homeserver configured at ${this.config.matrixHomeserver}. Sends=${this.sendCount}.`,
      stoppedDetail:
        "MATRIX_HOMESERVER and MATRIX_ACCESS_TOKEN should both be configured.",
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
  }

  async send(message: OutboundPlatformMessage) {
    if (!this.config.matrixHomeserver || !this.config.matrixAccessToken) {
      this.lastError =
        "MATRIX_HOMESERVER and MATRIX_ACCESS_TOKEN are required.";
      this.lifecycle.record("error", this.lastError);
      throw new Error(this.lastError);
    }

    const roomId = encodeURIComponent(message.roomId);
    const txnId = randomUUID();
    const url = `${this.config.matrixHomeserver.replace(/\/$/u, "")}/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${txnId}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.config.matrixAccessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: message.text,
        "m.relates_to": message.replyToId
          ? {
              "m.in_reply_to": {
                event_id: message.replyToId,
              },
            }
          : undefined,
      }),
    });

    if (!response.ok) {
      this.lastError = `Matrix send failed (${response.status}): ${await response.text()}`;
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
      `Matrix delivery ${record.id} to ${message.roomId}.`,
    );
    return record;
  }

  canReceive(): boolean {
    return Boolean(
      this.config.matrixHomeserver && this.config.matrixAccessToken,
    );
  }

  observe(event: PlatformLifecycleEvent): void {
    this.lifecycle.record(event.kind, event.detail);
    if (event.kind === "error" || event.kind === "reject") {
      this.lastError = event.detail;
    }
  }
}
