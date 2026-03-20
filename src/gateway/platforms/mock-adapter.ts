import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage, PlatformName } from "@/types";
import { capabilitiesForPlatform, nowIso, type PlatformAdapter, type PlatformHealth } from "./base";

export class MockPlatformAdapter implements PlatformAdapter {
  private status: "idle" | "running" | "stopped" = "idle";
  private startedAt?: string;
  private stoppedAt?: string;
  private lastSendAt?: string;
  private sendCount = 0;

  constructor(
    public readonly name: PlatformName,
    private readonly delivery: DeliveryService,
  ) {}

  async start(): Promise<void> {
    this.status = "running";
    this.startedAt = nowIso();
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
  }

  async health(): Promise<PlatformHealth> {
    const capabilities = capabilitiesForPlatform(this.name);
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running",
      mode: "mock",
      capabilities,
      detail: `${this.name} mock adapter active for local parity scaffolding. Inbound=${capabilities.inbound}, replies=${capabilities.replies}, threads=${capabilities.threads}.`,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastSendAt: this.lastSendAt,
      sendCount: this.sendCount,
    };
  }

  async send(message: OutboundPlatformMessage): Promise<void> {
    this.sendCount += 1;
    this.lastSendAt = nowIso();
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
