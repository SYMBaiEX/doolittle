import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { PlatformAdapter, PlatformHealth } from "./base";

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
      ready: this.status === "running" && Boolean(this.config.discordBotToken),
      mode: "native",
      capabilities: {
        inbound: true,
        outbound: true,
        pairing: true,
        attachments: true,
      },
      detail: this.config.discordBotToken
        ? "Discord bot token configured."
        : "DISCORD_BOT_TOKEN is not configured.",
    };
  }

  async send(message: { roomId: string; userId?: string; text: string }): Promise<void> {
    if (!this.config.discordBotToken) {
      throw new Error("DISCORD_BOT_TOKEN is not configured.");
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${message.roomId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.config.discordBotToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: message.text,
        }),
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
