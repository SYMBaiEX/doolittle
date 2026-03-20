import type { DeliveryService } from "@/services/delivery-service";
import type { OutboundPlatformMessage, PlatformName } from "@/types";
import {
  capabilitiesForPlatform,
  createLifecycleHistory,
  nowIso,
  type PlatformAdapter,
  type PlatformHealth,
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
    this.status = this.command ? "running" : "stopped";
    if (this.status === "running") {
      this.startedAt = nowIso();
      this.lastError = undefined;
      this.lifecycle.record("start", `${this.name} command adapter started.`);
    } else {
      this.lastError = this.missingDetail;
      this.lifecycle.record("error", this.lastError);
    }
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.stoppedAt = nowIso();
    this.lifecycle.record("stop", `${this.name} command adapter stopped.`);
  }

  async health(): Promise<PlatformHealth> {
    this.lifecycle.record(
      "health",
      `${this.name} command adapter health: status=${this.status} sends=${this.sendCount}.`,
    );
    return {
      platform: this.name,
      status: this.status,
      ready: this.status === "running" && this.canReceive(),
      mode: "native",
      capabilities: capabilitiesForPlatform(this.name),
      detail: this.command ? this.description : this.missingDetail,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastSendAt: this.lastSendAt,
      lastDeliveryAt: this.lastDeliveryAt,
      lastDeliveryId: this.lastDeliveryId,
      sendCount: this.sendCount,
      lastError: this.lastError,
      events: this.lifecycle.recent(6),
    };
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
        result.stderr || `${this.name} command adapter failed with exit code ${result.exitCode}.`;
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
        metadata: {
          ...(message.metadata ?? {}),
          commandStdout: result.stdout,
        },
      },
    );

    this.lastDeliveryAt = nowIso();
    this.lastDeliveryId = record.id;
    this.lifecycle.record(
      "deliver",
      `${this.name} command delivery ${record.id} to ${message.roomId}.`,
    );
    return record;
  }

  canReceive(): boolean {
    return Boolean(this.command);
  }
}
