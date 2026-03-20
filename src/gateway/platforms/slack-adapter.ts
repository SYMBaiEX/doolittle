import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage } from "@/types";
import { capabilitiesForPlatform, type PlatformAdapter, type PlatformHealth } from "./base";

export class SlackPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status =
      this.config.slackWebhookUrl && this.config.slackSigningSecret ? "running" : "stopped";
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
      detail: this.config.slackWebhookUrl
        ? this.config.slackSigningSecret
          ? "Slack webhook and signing secret configured; threaded replies are supported."
          : "SLACK_SIGNING_SECRET is not configured."
        : "SLACK_WEBHOOK_URL is not configured.",
    };
  }

  async send(message: OutboundPlatformMessage): Promise<void> {
    if (!this.config.slackWebhookUrl) {
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
      throw new Error(`Slack send failed (${response.status}): ${await response.text()}`);
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
    return Boolean(this.config.slackWebhookUrl && this.config.slackSigningSecret);
  }
}
