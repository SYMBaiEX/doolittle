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

export class TelegramPlatformAdapter implements PlatformAdapter {
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
      Boolean(this.config.telegramBotToken),
      "Telegram adapter started with configured bot token.",
      "TELEGRAM_BOT_TOKEN is not configured.",
      this.lifecycle,
    );
    this.status = started.status;
    this.startedAt = started.startedAt;
    this.lastError = started.lastError;
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", "Telegram adapter stopped.");
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
      configured: Boolean(this.config.telegramBotToken),
      readyWhenRunning: bridge ? bridge.ready : true,
      configuredDetail:
        "Telegram token configured; replies and threaded session routing are enabled.",
      missingDetail: "TELEGRAM_BOT_TOKEN is not configured.",
      runningDetail: bridge
        ? `${bridge.summary}; ${bridge.detail}`
        : [
            "Telegram token configured; replies and threaded session routing are enabled.",
            `Sends=${this.sendCount}.`,
          ].join(" "),
      stoppedDetail: "TELEGRAM_BOT_TOKEN is not configured.",
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
    if (!this.config.telegramBotToken) {
      this.lastError = "TELEGRAM_BOT_TOKEN is not configured.";
      this.lifecycle.record("error", this.lastError);
      throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
    }

    const apiRoot = this.config.telegramApiRoot ?? "https://api.telegram.org";
    const voicePath = this.resolveVoiceAttachment(message.metadata);
    const response = voicePath
      ? await this.sendVoice(apiRoot, message, voicePath)
      : await fetch(
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
                ? {
                    reply_to_message_id:
                      Number(message.replyToId) || message.replyToId,
                  }
                : {}),
            }),
          },
        );

    const bodyText = await response.text();
    if (!response.ok) {
      this.lastError = `Telegram send failed (${response.status}): ${bodyText}`;
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
        metadata: this.withTelegramMessageMetadata(message.metadata, bodyText),
      },
    );
    this.lastDeliveryAt = nowIso();
    this.lastDeliveryId = record.id;
    this.lifecycle.record(
      "deliver",
      `Telegram delivery ${record.id} to ${message.roomId}${message.threadId ? ` thread=${message.threadId}` : ""}${message.replyToId ? ` replyTo=${message.replyToId}` : ""}.`,
    );
    return record;
  }

  async edit(
    delivery: Awaited<ReturnType<TelegramPlatformAdapter["send"]>>,
    message: OutboundPlatformMessage,
  ) {
    if (!this.config.telegramBotToken) {
      this.lastError = "TELEGRAM_BOT_TOKEN is not configured.";
      this.lifecycle.record("error", this.lastError);
      throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
    }

    const chatId = delivery.metadata?.platformRoomId ?? message.roomId;
    const telegramMessageId =
      delivery.metadata?.platformMessageId ?? message.replyToId;
    if (!chatId || !telegramMessageId) {
      throw new Error(
        "Telegram edit requires a stored platformRoomId and platformMessageId.",
      );
    }

    const apiRoot = this.config.telegramApiRoot ?? "https://api.telegram.org";
    const response = await fetch(
      `${apiRoot}/bot${this.config.telegramBotToken}/editMessageText`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: Number(telegramMessageId) || telegramMessageId,
          text: message.text,
        }),
      },
    );
    const bodyText = await response.text();
    if (!response.ok) {
      this.lastError = `Telegram edit failed (${response.status}): ${bodyText}`;
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
      metadata: this.withTelegramMessageMetadata(
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
      `Telegram delivery ${updated.id} edited in ${message.roomId}.`,
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

  private async sendVoice(
    apiRoot: string,
    message: OutboundPlatformMessage,
    voicePath: string,
  ): Promise<Response> {
    const form = new FormData();
    form.set("chat_id", message.roomId);
    form.set("caption", message.text);
    form.set("voice", Bun.file(voicePath));
    if (message.replyToId) {
      form.set(
        "reply_to_message_id",
        String(Number(message.replyToId) || message.replyToId),
      );
    }
    return fetch(`${apiRoot}/bot${this.config.telegramBotToken}/sendVoice`, {
      method: "POST",
      body: form,
    });
  }

  private withTelegramMessageMetadata(
    metadata: Record<string, string> | undefined,
    bodyText: string,
  ): Record<string, string> {
    const parsed = this.parseTelegramResponse(bodyText);
    return {
      ...(metadata ?? {}),
      ...(parsed.messageId ? { platformMessageId: parsed.messageId } : {}),
      ...(parsed.chatId ? { platformRoomId: parsed.chatId } : {}),
    };
  }

  private parseTelegramResponse(bodyText: string): {
    messageId?: string;
    chatId?: string;
  } {
    try {
      const parsed = JSON.parse(bodyText) as {
        result?: {
          message_id?: number | string;
          chat?: { id?: number | string };
        };
      };
      return {
        messageId: parsed.result?.message_id
          ? String(parsed.result.message_id)
          : undefined,
        chatId: parsed.result?.chat?.id
          ? String(parsed.result.chat.id)
          : undefined,
      };
    } catch {
      return {};
    }
  }

  canReceive(): boolean {
    return Boolean(this.config.telegramBotToken);
  }

  observe(event: PlatformLifecycleEvent): void {
    this.lifecycle.record(event.kind, event.detail);
    if (event.kind === "error" || event.kind === "reject") {
      this.lastError = event.detail;
    }
  }
}
