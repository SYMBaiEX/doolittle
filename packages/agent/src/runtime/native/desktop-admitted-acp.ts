import { randomUUID } from "node:crypto";
import type { IAgentRuntime } from "@elizaos/core";
import {
  AcpService,
  AcpSessionStore,
  type SendOptions,
  type SpawnOptions,
} from "@elizaos/plugin-agent-orchestrator";
import {
  acquireExecutionLease,
  getScopedExecutionLease,
} from "@/runtime/execution-admission";

function desktopParentRunId(metadata?: Record<string, unknown>): string | null {
  if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") return null;
  const parent = getScopedExecutionLease();
  if (!parent || metadata?.doolittleParentRunId !== parent.runId) {
    throw new Error(
      "An active, matching desktop run is required for ACP execution.",
    );
  }
  return parent.runId;
}

/** The SDK retains ACP session/process authority; the desktop host owns slots. */
export class DesktopAdmittedAcpService extends AcpService {
  static override async start(
    runtime: IAgentRuntime,
  ): Promise<DesktopAdmittedAcpService> {
    const backendSetting =
      runtime.getSetting("ELIZA_ACP_SESSION_STORE_BACKEND") ??
      process.env.ELIZA_ACP_SESSION_STORE_BACKEND;
    const backend =
      backendSetting === "runtime-db" ||
      backendSetting === "file" ||
      backendSetting === "memory"
        ? backendSetting
        : undefined;
    const store = new AcpSessionStore({
      runtime: {
        databaseAdapter: (
          runtime as IAgentRuntime & { databaseAdapter?: unknown }
        ).databaseAdapter,
        logger: runtime.logger as never,
        getSetting: (key) => {
          const value = runtime.getSetting(key);
          return typeof value === "string" ? value : undefined;
        },
      },
      backend,
    });
    const service = new DesktopAdmittedAcpService(runtime, { store });
    await service.start();
    return service;
  }

  constructor(
    runtime?: IAgentRuntime,
    options?: ConstructorParameters<typeof AcpService>[1],
  ) {
    if (!runtime) throw new Error("ACP runtime is required.");
    super(runtime, options);
  }

  override async start(): Promise<void> {
    await super.start();
    if (process.env.DOOLITTLE_DESKTOP_RUNTIME === "1") {
      await this.resumeOrphanedBusySessions();
    }
  }

  override async spawnSession(options: SpawnOptions) {
    const parentRunId = desktopParentRunId(options.metadata);
    const lease = parentRunId
      ? await acquireExecutionLease({
          runId: `acp:${randomUUID()}`,
          sessionId: parentRunId,
          kind: "automatic-acp",
        })
      : null;
    try {
      return await super.spawnSession(options);
    } finally {
      await lease?.release();
    }
  }

  override async sendPrompt(
    sessionId: string,
    text: string,
    options?: SendOptions,
  ) {
    if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") {
      return super.sendPrompt(sessionId, text, options);
    }
    const session = await super.getSession(sessionId);
    if (!session) throw new Error("ACP session is unavailable.");
    const parentRunId = desktopParentRunId(session.metadata);
    const lease = await acquireExecutionLease({
      runId: `acp:${randomUUID()}`,
      sessionId: parentRunId as string,
      kind: "automatic-acp",
    });
    try {
      return await super.sendPrompt(sessionId, text, options);
    } finally {
      await lease?.release();
    }
  }

  override async reattachSession(sessionId: string) {
    if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") {
      return super.reattachSession(sessionId);
    }
    const session = await super.getSession(sessionId);
    if (!session) throw new Error("ACP session is unavailable.");
    const parentRunId = desktopParentRunId(session.metadata);
    const lease = await acquireExecutionLease({
      runId: `acp:${randomUUID()}`,
      sessionId: parentRunId as string,
      kind: "automatic-acp",
    });
    try {
      return await super.reattachSession(sessionId);
    } finally {
      await lease?.release();
    }
  }

  override async resumeOrphanedBusySessions() {
    if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") {
      return super.resumeOrphanedBusySessions();
    }
    const sessions = await super.listSessions();
    const orphaned = sessions.filter((session) =>
      ["running", "busy", "blocked", "authenticating", "tool_running"].includes(
        session.status,
      ),
    );
    for (const session of orphaned) await super.stopSession(session.id);
    return { resumed: 0, skipped: orphaned.length };
  }

  /** Emergency stop without unloading the SDK service from the runtime. */
  async stopAllAdmittedSessions(): Promise<number> {
    const sessions = await super.listSessions();
    const active = sessions.filter((session) =>
      ["running", "busy", "blocked", "authenticating", "tool_running"].includes(
        session.status,
      ),
    );
    await Promise.all(active.map((session) => super.stopSession(session.id)));
    return active.length;
  }
}
