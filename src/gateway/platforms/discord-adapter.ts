import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage } from "@/types";
import {
  capabilitiesForPlatform,
  createLifecycleHistory,
  nowIso,
  type PlatformAdapter,
  type PlatformHealth,
} from "./base";

export class DiscordPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";
  private startedAt?: string;
  private stoppedAt?: string;
  private lastSendAt?: string;
  private sendCount = 0;
  private lastError?: string;
  private readonly lifecycle = createLifecycleHistory();

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status = this.config.discordBotToken ? "running" : "stopped";
    if (this.status === "running") {
      this.startedAt = nowIso();
      this.lastError = undefined;
      this.lifecycle.record("start", "Discord adapter started with configured bot token.");
    } else {
      this.lastError = "DISCORD_BOT_TOKEN is not configured.";
      this.lifecycle.record("error", this.lastError);
    }
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", "Discord adapter stopped.");
  }

  async health(): Promise<PlatformHealth> {
    this.lifecycle.record(
      "health",
      `Discord health check: status=${this.status} sends=${this.sendCount} ready=${this.status === "running" && this.canReceive()}.`,
    );
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running" && this.canReceive(),
      mode: "native",
      capabilities: capabilitiesForPlatform(this.name),
      detail: this.config.discordBotToken
        ? `Discord bot token configured; replies, threads, and attachments are supported. Sends=${this.sendCount}.`
        : "DISCORD_BOT_TOKEN is not configured.",
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastSendAt: this.lastSendAt,
      sendCount: this.sendCount,
      lastError: this.lastError,
      events: this.lifecycle.recent(6),
    };
  }

  async send(message: OutboundPlatformMessage) {
    if (!this.config.discordBotToken) {
      this.lastError = "DISCORD_BOT_TOKEN is not configured.";
      this.lifecycle.record("error", this.lastError);
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
    if (message.threadId) {
      payload.message_reference = {
        ...(payload.message_reference as Record<string, unknown>),
        message_id: message.threadId,
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
      this.lastError = `Discord send failed (${response.status}): ${await response.text()}`;
      this.lifecycle.record("error", this.lastError);
      throw new Error(this.lastError);
    }

    this.sendCount += 1;
    this.lastSendAt = nowIso();
    this.lastError = undefined;
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
    this.lifecycle.record(
      "send",
      `Discord delivery ${record.id} to ${message.roomId}${message.threadId ? ` thread=${message.threadId}` : ""}${message.replyToId ? ` replyTo=${message.replyToId}` : ""}.`,
    );
    return record;
  }

  canReceive(): boolean {
    return Boolean(this.config.discordBotToken);
  }
}
