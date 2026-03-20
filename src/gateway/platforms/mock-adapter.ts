import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage, PlatformName } from "@/types";
import { capabilitiesForPlatform, type PlatformAdapter, type PlatformHealth } from "./base";

export class MockPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";

  constructor(
    public readonly name: PlatformName,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status = "running";
  }

  async stop(): Promise<void> {
    this.status = "stopped";
  }

  async health(): Promise<PlatformHealth> {
    const capabilities = capabilitiesForPlatform(this.name);
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running",
      mode: "mock",
      capabilities,
      detail: `${this.name} mock adapter active for local native experience scaffolding. Inbound=${capabilities.inbound}, replies=${capabilities.replies}, threads=${capabilities.threads}.`,
    };
  }

  async send(message: OutboundPlatformMessage): Promise<void> {
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
    return true;
  }
}
