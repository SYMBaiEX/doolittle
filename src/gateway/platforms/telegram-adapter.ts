import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage } from "@/types";
import { capabilitiesForPlatform, nowIso, type PlatformAdapter, type PlatformHealth } from "./base";

export class TelegramPlatformAdapter implements PlatformAdapter {
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
    if (!this.config.telegramBotToken) {
      this.status = "stopped";
      this.lastError = "TELEGRAM_BOT_TOKEN is not configured.";
      return;
    }

    this.status = "running";
    this.startedAt = nowIso();
    this.lastError = undefined;
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
  }

  async health(): Promise<PlatformHealth> {
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running" && this.canReceive(),
      mode: "native",
      capabilities: capabilitiesForPlatform(this.name),
      detail: this.config.telegramBotToken
        ? `Telegram token configured; replies and threaded session routing are enabled. Sends=${this.sendCount}.`
        : "Telegram token missing.",
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastSendAt: this.lastSendAt,
      sendCount: this.sendCount,
      lastError: this.lastError,
    };
  }

  async send(message: OutboundPlatformMessage): Promise<void> {
    if (!this.config.telegramBotToken) {
      this.lastError = "TELEGRAM_BOT_TOKEN is not configured.";
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
          ...(message.replyToId
            ? { reply_to_message_id: Number(message.replyToId) || message.replyToId }
            : {}),
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      this.lastError = `Telegram send failed (${response.status}): ${body}`;
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
    return Boolean(this.config.telegramBotToken);
  }
}
