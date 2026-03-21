import { existsSync } from "node:fs";
import type { NativeMessagingTransportState } from "@/runtime/native/service-bridge";
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

export class DiscordPlatformAdapter implements PlatformAdapter {
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
    private readonly nativeBridge?: () =>
      | NativeMessagingTransportState
      | undefined,
  ) {}

  async start(): Promise<void> {
    const started = trackTransportStart(
      this.name,
      Boolean(this.config.discordBotToken),
      "Discord adapter started with configured bot token.",
      "DISCORD_BOT_TOKEN is not configured.",
      this.lifecycle,
    );
    this.status = started.status;
    this.startedAt = started.startedAt;
    this.lastError = started.lastError;
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", "Discord adapter stopped.");
  }

  async health(): Promise<PlatformHealth> {
    const bridge = this.nativeBridge?.();
    const ready =
      this.status === "running" &&
      this.canReceive() &&
      (bridge ? bridge.ready : true);
    this.lifecycle.record(
      "health",
      describeTransportHealth(this.name, this.status, this.sendCount, ready),
    );
    const health = buildConfiguredTransportHealth({
      platform: this.name,
      status: this.status,
      sendCount: this.sendCount,
      configured: Boolean(this.config.discordBotToken),
      readyWhenRunning: bridge ? bridge.ready : true,
      configuredDetail:
        "Discord bot token configured; replies, threads, and attachments are supported.",
      missingDetail: "DISCORD_BOT_TOKEN is not configured.",
      runningDetail: bridge
        ? `${bridge.summary}; ${bridge.detail}`
        : [
            "Discord bot token configured; replies, threads, and attachments are supported.",
            `Sends=${this.sendCount}.`,
          ].join(" "),
      stoppedDetail: "DISCORD_BOT_TOKEN is not configured.",
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
    return {
      ...health,
      nativePluginId: bridge?.pluginId,
      nativePluginSource: bridge?.pluginSource,
      nativePluginEnabled: bridge?.pluginEnabled,
      nativePluginNotes: bridge
        ? `${bridge.summary}; ${bridge.detail}`
        : undefined,
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

    const voicePath = this.resolveVoiceAttachment(message.metadata);
    const response = voicePath
      ? await this.sendVoiceMessage(message, payload, voicePath)
      : await fetch(
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

    const bodyText = await response.text();
    if (!response.ok) {
      this.lastError = `Discord send failed (${response.status}): ${bodyText}`;
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
        metadata: this.withDiscordMessageMetadata(message.metadata, bodyText),
      },
    );
    this.lastDeliveryAt = nowIso();
    this.lastDeliveryId = record.id;
    this.lifecycle.record(
      "deliver",
      `Discord delivery ${record.id} to ${message.roomId}${message.threadId ? ` thread=${message.threadId}` : ""}${message.replyToId ? ` replyTo=${message.replyToId}` : ""}.`,
    );
    return record;
  }

  async edit(
    delivery: Awaited<ReturnType<DiscordPlatformAdapter["send"]>>,
    message: OutboundPlatformMessage,
  ) {
    if (!this.config.discordBotToken) {
      this.lastError = "DISCORD_BOT_TOKEN is not configured.";
      this.lifecycle.record("error", this.lastError);
      throw new Error("DISCORD_BOT_TOKEN is not configured.");
    }

    const channelId = delivery.metadata?.platformRoomId ?? message.roomId;
    const discordMessageId =
      delivery.metadata?.platformMessageId ?? message.replyToId;
    if (!channelId || !discordMessageId) {
      throw new Error(
        "Discord edit requires a stored platformRoomId and platformMessageId.",
      );
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${discordMessageId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${this.config.discordBotToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: message.text,
        }),
      },
    );
    const bodyText = await response.text();
    if (!response.ok) {
      this.lastError = `Discord edit failed (${response.status}): ${bodyText}`;
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
    const updated = this.delivery.update(delivery.id, message.text, {
      threadId: message.threadId,
      replyToId: message.replyToId,
      metadata: this.withDiscordMessageMetadata(
        {
          ...(delivery.metadata ?? {}),
          ...(message.metadata ?? {}),
        },
        bodyText,
      ),
    });
    this.lastDeliveryAt = nowIso();
    this.lastDeliveryId = updated.id;
    this.lifecycle.record(
      "edit",
      `Discord delivery ${updated.id} edited in ${channelId}.`,
    );
    return updated;
  }

  private resolveVoiceAttachment(
    metadata?: Record<string, string>,
  ): string | undefined {
    if (metadata?.audioAsVoice !== "true") {
      return undefined;
    }
    const firstPath = metadata.attachmentUrls?.split("|").find(Boolean)?.trim();
    if (!firstPath || !existsSync(firstPath)) {
      return undefined;
    }
    return firstPath;
  }

  private async sendVoiceMessage(
    message: OutboundPlatformMessage,
    payload: Record<string, unknown>,
    voicePath: string,
  ): Promise<Response> {
    const form = new FormData();
    form.set("payload_json", JSON.stringify(payload));
    form.set("files[0]", Bun.file(voicePath), voicePath.split("/").at(-1));
    return fetch(
      `https://discord.com/api/v10/channels/${message.roomId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.config.discordBotToken}`,
        },
        body: form,
      },
    );
  }

  private withDiscordMessageMetadata(
    metadata: Record<string, string> | undefined,
    bodyText: string,
  ): Record<string, string> {
    const parsed = this.parseDiscordResponse(bodyText);
    return {
      ...(metadata ?? {}),
      ...(parsed.messageId ? { platformMessageId: parsed.messageId } : {}),
      ...(parsed.channelId ? { platformRoomId: parsed.channelId } : {}),
    };
  }

  private parseDiscordResponse(bodyText: string): {
    messageId?: string;
    channelId?: string;
  } {
    try {
      const parsed = JSON.parse(bodyText) as {
        id?: string;
        channel_id?: string;
      };
      return {
        messageId: parsed.id,
        channelId: parsed.channel_id,
      };
    } catch {
      return {};
    }
  }

  canReceive(): boolean {
    return Boolean(this.config.discordBotToken);
  }

  observe(event: PlatformLifecycleEvent): void {
    this.lifecycle.record(event.kind, event.detail);
    if (event.kind === "error" || event.kind === "reject") {
      this.lastError = event.detail;
    }
  }
}
