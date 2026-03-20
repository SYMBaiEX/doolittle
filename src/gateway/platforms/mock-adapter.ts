import type { DeliveryService } from "@/services/delivery-service";
import { capabilitiesForPlatform, type PlatformAdapter, type PlatformHealth } from "./base";
import type { PlatformName } from "@/types";

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
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running",
      mode: "mock",
      capabilities: capabilitiesForPlatform(this.name),
      detail: "Mock adapter active for local parity scaffolding.",
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
    return true;
  }
}
