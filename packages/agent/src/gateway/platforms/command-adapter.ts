import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage, PlatformName } from "@/types";
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

async function runShellCommand(
  command: string,
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd: ["/bin/zsh", "-lc", command],
    env: {
      ...process.env,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

export class CommandPlatformAdapter implements PlatformAdapter {
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
    private readonly delivery: DeliveryService,
    private readonly command: string | undefined,
    private readonly missingDetail: string,
    private readonly description: string,
  ) {}

  async start(): Promise<void> {
    const started = trackTransportStart(
      this.name,
      Boolean(this.command),
      `${this.name} command adapter started.`,
      this.missingDetail,
      this.lifecycle,
    );
    this.status = started.status;
    this.startedAt = started.startedAt;
    this.lastError = started.lastError;
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", `${this.name} command adapter stopped.`);
  }

  async health(): Promise<PlatformHealth> {
    const ready = this.status === "running" && this.canReceive();
    this.lifecycle.record(
      "health",
      describeTransportHealth(this.name, this.status, this.sendCount, ready),
    );
    return buildConfiguredTransportHealth({
      platform: this.name,
      status: this.status,
      sendCount: this.sendCount,
      configured: Boolean(this.command),
      configuredDetail: this.description,
      missingDetail: this.missingDetail,
      runningDetail: `${this.description} Sends=${this.sendCount}.`,
      stoppedDetail: this.missingDetail,
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
  }

  async send(message: OutboundPlatformMessage) {
    if (!this.command) {
      this.lastError = this.missingDetail;
      this.lifecycle.record("error", this.lastError);
      throw new Error(this.lastError);
    }

    const result = await runShellCommand(this.command, {
      ELIZA_AGENT_PLATFORM: this.name,
      ELIZA_AGENT_ROOM_ID: message.roomId,
      ELIZA_AGENT_USER_ID: message.userId ?? "",
      ELIZA_AGENT_MESSAGE_TEXT: message.text,
      ELIZA_AGENT_THREAD_ID: message.threadId ?? "",
      ELIZA_AGENT_REPLY_TO_ID: message.replyToId ?? "",
    });

    if (result.exitCode !== 0) {
      this.lastError =
        result.stderr ||
        `${this.name} command adapter failed with exit code ${result.exitCode}.`;
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
        metadata: {
          ...(message.metadata ?? {}),
          commandStdout: result.stdout,
        },
      },
    );

    this.lastDeliveryAt = nowIso();
    this.lastDeliveryId = record.id;
    this.lastOutboundMetadataKeys = Object.keys(record.metadata ?? {});
    this.lifecycle.record(
      "deliver",
      `${this.name} command delivery ${record.id} to ${message.roomId}.`,
    );
    return record;
  }

  canReceive(): boolean {
    return Boolean(this.command);
  }

  observe(event: PlatformLifecycleEvent): void {
    this.lifecycle.record(event.kind, event.detail);
    if (event.kind === "error" || event.kind === "reject") {
      this.lastError = event.detail;
    }
  }
}
