import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { PlatformAdapter, PlatformHealth } from "./base";

export class TelegramPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    if (!this.config.telegramBotToken) {
      this.status = "stopped";
      return;
    }

    this.status = "running";
  }

  async stop(): Promise<void> {
    this.status = "stopped";
  }

  async health(): Promise<PlatformHealth> {
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running" && Boolean(this.config.telegramBotToken),
      mode: "native",
      capabilities: {
        inbound: true,
        outbound: true,
        pairing: true,
        attachments: true,
      },
      detail: this.config.telegramBotToken
        ? "Telegram token configured."
        : "Telegram token missing.",
    };
  }

  async send(message: { roomId: string; userId?: string; text: string }): Promise<void> {
    if (!this.config.telegramBotToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
    }

    const apiRoot = this.config.telegramApiRoot ?? "https://api.telegram.org";
    const response = await fetch(
      `${apiRoot}/bot${this.config.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chat_id: message.roomId,
          text: message.text,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram send failed (${response.status}): ${body}`);
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
    return Boolean(this.config.telegramBotToken);
  }
}
