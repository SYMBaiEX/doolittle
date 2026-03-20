import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { PlatformAdapter, PlatformHealth } from "./base";

export class WhatsAppPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status =
      this.config.whatsappAccessToken && this.config.whatsappPhoneNumberId
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
      capabilities: {
        inbound: true,
        outbound: true,
        pairing: true,
        attachments: true,
      },
      detail: ready
        ? "WhatsApp Graph API credentials configured."
        : "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required.",
    };
  }

  async send(message: { roomId: string; userId?: string; text: string }): Promise<void> {
    if (!this.config.whatsappAccessToken || !this.config.whatsappPhoneNumberId) {
      throw new Error("WhatsApp credentials are not configured.");
    }

    const response = await fetch(
      `https://graph.facebook.com/v22.0/${this.config.whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.whatsappAccessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.roomId,
          type: "text",
          text: { body: message.text },
        }),
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
    );
  }

  canReceive(): boolean {
    return Boolean(this.config.whatsappAccessToken && this.config.whatsappPhoneNumberId);
  }
}
