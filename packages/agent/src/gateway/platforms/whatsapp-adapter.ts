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

export class WhatsAppPlatformAdapter implements PlatformAdapter {
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
      this.config.whatsappAccessToken &&
        this.config.whatsappPhoneNumberId &&
        this.config.whatsappVerifyToken,
    );
    const started = trackTransportStart(
      this.name,
      configured,
      "WhatsApp adapter started with Graph API credentials.",
      !this.config.whatsappAccessToken
        ? "WHATSAPP_ACCESS_TOKEN is not configured."
        : !this.config.whatsappPhoneNumberId
          ? "WHATSAPP_PHONE_NUMBER_ID is not configured."
          : "WHATSAPP_VERIFY_TOKEN is not configured.",
      this.lifecycle,
    );
    this.status = started.status;
    this.startedAt = started.startedAt;
    this.lastError = started.lastError;
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", "WhatsApp adapter stopped.");
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
        this.config.whatsappAccessToken &&
          this.config.whatsappPhoneNumberId &&
          this.config.whatsappVerifyToken,
      ),
      configuredDetail:
        "WhatsApp Graph API credentials configured; replies are carried through message context.",
      missingDetail:
        "WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_VERIFY_TOKEN are required.",
      runningDetail: `WhatsApp Graph API credentials configured; replies are carried through message context. Sends=${this.sendCount}.`,
      stoppedDetail:
        "WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_VERIFY_TOKEN are required.",
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
    if (
      !this.config.whatsappAccessToken ||
      !this.config.whatsappPhoneNumberId
    ) {
      this.lastError = "WhatsApp credentials are not configured.";
      this.lifecycle.record("error", this.lastError);
      throw new Error("WhatsApp credentials are not configured.");
    }

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: message.roomId,
      type: "text",
      text: { body: message.text },
    };
    if (message.replyToId) {
      payload.context = { message_id: message.replyToId };
    }

    const response = await fetch(
      `https://graph.facebook.com/v22.0/${this.config.whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.whatsappAccessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      this.lastError = `WhatsApp send failed (${response.status}): ${await response.text()}`;
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
      `WhatsApp delivery ${record.id} to ${message.roomId}${message.replyToId ? ` replyTo=${message.replyToId}` : ""}.`,
    );
    return record;
  }

  canReceive(): boolean {
    return Boolean(
      this.config.whatsappAccessToken &&
        this.config.whatsappPhoneNumberId &&
        this.config.whatsappVerifyToken,
    );
  }

  observe(event: PlatformLifecycleEvent): void {
    this.lifecycle.record(event.kind, event.detail);
    if (event.kind === "error" || event.kind === "reject") {
      this.lastError = event.detail;
    }
  }
}
