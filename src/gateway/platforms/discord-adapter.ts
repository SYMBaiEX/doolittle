import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import { capabilitiesForPlatform, type PlatformAdapter, type PlatformHealth } from "./base";

export class DiscordPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status = this.config.discordBotToken ? "running" : "stopped";
  }

  async stop(): Promise<void> {
    this.status = "stopped";
  }

  async health(): Promise<PlatformHealth> {
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running" && this.canReceive(),
      mode: "native",
      capabilities: capabilitiesForPlatform(this.name),
      detail: this.config.discordBotToken
        ? "Discord bot token configured; replies, threads, and attachments are supported."
        : "DISCORD_BOT_TOKEN is not configured.",
    };
  }

  async send(message: {
    roomId: string;
    userId?: string;
    text: string;
    threadId?: string;
    replyToId?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    if (!this.config.discordBotToken) {
      throw new Error("DISCORD_BOT_TOKEN is not configured.");
    }

    const payload: Record<string, unknown> = {
      content: message.text,
    };
    if (message.replyToId) {
      payload.message_reference = {
        message_id: message.replyToId,
        channel_id: message.roomId,
      };
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${message.roomId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.config.discordBotToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      throw new Error(`Discord send failed (${response.status}): ${await response.text()}`);
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
    return Boolean(this.config.discordBotToken);
  }
}
