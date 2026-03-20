import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage } from "@/types";
import { capabilitiesForPlatform, type PlatformAdapter, type PlatformHealth } from "./base";

export class WhatsAppPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";

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
  }

  async stop(): Promise<void> {
    this.status = "stopped";
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
        ? "WhatsApp Graph API credentials configured; replies are carried through message context."
        : "WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_VERIFY_TOKEN are required.",
    };
  }

  async send(message: OutboundPlatformMessage): Promise<void> {
    if (!this.config.whatsappAccessToken || !this.config.whatsappPhoneNumberId) {
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
      throw new Error(`WhatsApp send failed (${response.status}): ${await response.text()}`);
    }

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
