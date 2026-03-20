import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage } from "@/types";
import { capabilitiesForPlatform, nowIso, type PlatformAdapter, type PlatformHealth } from "./base";

export class WhatsAppPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";
  private startedAt?: string;
  private stoppedAt?: string;
  private lastSendAt?: string;
  private sendCount = 0;
  private lastError?: string;

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status =
      this.config.whatsappAccessToken &&
      this.config.whatsappPhoneNumberId &&
      this.config.whatsappVerifyToken
        ? "running"
        : "stopped";
    if (this.status === "running") {
      this.startedAt = nowIso();
      this.lastError = undefined;
    } else {
      this.lastError = !this.config.whatsappAccessToken
        ? "WHATSAPP_ACCESS_TOKEN is not configured."
        : !this.config.whatsappPhoneNumberId
          ? "WHATSAPP_PHONE_NUMBER_ID is not configured."
          : "WHATSAPP_VERIFY_TOKEN is not configured.";
    }
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
  }

  async health(): Promise<PlatformHealth> {
    const ready = Boolean(
      this.config.whatsappAccessToken && this.config.whatsappPhoneNumberId,
    );
    return {
      platform: this.name,
      status: this.status,
      ready,
      mode: "native",
      capabilities: capabilitiesForPlatform(this.name),
      detail: ready
        ? `WhatsApp Graph API credentials configured; replies are carried through message context. Sends=${this.sendCount}.`
        : "WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_VERIFY_TOKEN are required.",
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastSendAt: this.lastSendAt,
      sendCount: this.sendCount,
      lastError: this.lastError,
    };
  }

  async send(message: OutboundPlatformMessage): Promise<void> {
    if (!this.config.whatsappAccessToken || !this.config.whatsappPhoneNumberId) {
      this.lastError = "WhatsApp credentials are not configured.";
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
      throw new Error(this.lastError);
    }

    this.sendCount += 1;
    this.lastSendAt = nowIso();
    this.lastError = undefined;
    this.delivery.deliver(
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
  }

  canReceive(): boolean {
    return Boolean(
      this.config.whatsappAccessToken &&
        this.config.whatsappPhoneNumberId &&
        this.config.whatsappVerifyToken,
    );
  }
}
