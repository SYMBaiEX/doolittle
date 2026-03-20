import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage } from "@/types";
import { capabilitiesForPlatform, nowIso, type PlatformAdapter, type PlatformHealth } from "./base";

export class SlackPlatformAdapter implements PlatformAdapter {
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
      this.config.slackWebhookUrl && this.config.slackSigningSecret ? "running" : "stopped";
    if (this.status === "running") {
      this.startedAt = nowIso();
      this.lastError = undefined;
    } else {
      this.lastError = !this.config.slackWebhookUrl
        ? "SLACK_WEBHOOK_URL is not configured."
        : "SLACK_SIGNING_SECRET is not configured.";
    }
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
      detail: this.config.slackWebhookUrl
        ? this.config.slackSigningSecret
          ? `Slack webhook and signing secret configured; threaded replies are supported. Sends=${this.sendCount}.`
          : "SLACK_SIGNING_SECRET is not configured."
        : "SLACK_WEBHOOK_URL is not configured.",
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastSendAt: this.lastSendAt,
      sendCount: this.sendCount,
      lastError: this.lastError,
    };
  }

  async send(message: OutboundPlatformMessage): Promise<void> {
    if (!this.config.slackWebhookUrl) {
      this.lastError = "SLACK_WEBHOOK_URL is not configured.";
      throw new Error("SLACK_WEBHOOK_URL is not configured.");
    }

    const payload: Record<string, unknown> = {
      text: message.text,
    };
    if (message.threadId) {
      payload.thread_ts = message.threadId;
    }
    if (message.replyToId) {
      payload.thread_ts = message.replyToId;
    }

    const response = await fetch(this.config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      this.lastError = `Slack send failed (${response.status}): ${await response.text()}`;
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
    return Boolean(this.config.slackWebhookUrl && this.config.slackSigningSecret);
  }
}
