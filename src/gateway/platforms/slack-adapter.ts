import type { EnvConfig, PlatformName } from "@/types";
import type { DeliveryService } from "@/services/delivery-service";
import type { PlatformAdapter, PlatformHealth } from "./base";

export class SlackPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";

  constructor(
    public readonly name: PlatformName,
    private readonly config: EnvConfig,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status = this.config.slackWebhookUrl ? "running" : "stopped";
  }

  async stop(): Promise<void> {
    this.status = "stopped";
  }

  async health(): Promise<PlatformHealth> {
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running" && Boolean(this.config.slackWebhookUrl),
      mode: "native",
      capabilities: {
        inbound: true,
        outbound: true,
        pairing: true,
        attachments: false,
      },
      detail: this.config.slackWebhookUrl
        ? "Slack webhook configured."
        : "SLACK_WEBHOOK_URL is not configured.",
    };
  }

  async send(message: { roomId: string; userId?: string; text: string }): Promise<void> {
    if (!this.config.slackWebhookUrl) {
      throw new Error("SLACK_WEBHOOK_URL is not configured.");
    }

    const response = await fetch(this.config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: message.text,
      }),
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
    );
  }

  canReceive(): boolean {
    return Boolean(this.config.slackWebhookUrl);
  }
}
