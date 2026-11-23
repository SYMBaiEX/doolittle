import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { rejectAtDeadline } from "@elizaos/core/protocol";
import {
  AcpService,
  AcpSessionStore,
  type SendOptions,
  type SessionInfo,
  type SpawnOptions,
} from "@elizaos/plugin-agent-orchestrator";
import { assertNativeAcpStateDirectories } from "../bootstrap/env/plugin-settings/ambient";
import {
  acquireExecutionLease,
  type ExecutionLease,
  getScopedExecutionLease,
  getScopedSdkTaskSpawn,
} from "../execution-admission";
import {
  getScopedTurnAbortSignal,
  runWithAdditionalTurnRuntimeSettings,
} from "../turn-runtime-scope";
import {
  requireConversationWorkspace,
  resolveConversationWorkspace,
} from "../workspace-scope";
import {
  bundledCodexAcpCommand,
  bundledCodexAcpEnv,
} from "./coding-delegation/model";

type PendingAdmission = {
  sessionId?: string;
  controller: AbortController;
  started: boolean;
  stoppedLateSessionId?: string;
  stopOnAbort?: Promise<void>;
  cleanupFailed: boolean;
  settled: Promise<void>;
  resolveSettled(): void;
};
type AdmittedOperation = {
  signal: AbortSignal;
  start(): void;
  recordStoppedLateSession(sessionId: string): void;
  markTeardownFailed(): void;
  finish(): Promise<void>;
};

const STOP_CONFIRMATION_TIMEOUT_MS = 5_000;

const ACTIVE_STATUSES = new Set([
  "running",
  "busy",
  "blocked",
  "authenticating",
  "tool_running",
]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "errored",
  "failed",
  "stopped",
  "cancelled",
  "canceled",
]);

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

function workspaceWithin(approved: string, requested: string): boolean {
  if (!isAbsolute(requested)) return false;
  try {
    const rel = relative(realpathSync(approved), realpathSync(requested));
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  } catch {
    return false;
  }
}

function admittedSdkSpawn(options: SpawnOptions): SpawnOptions {
  if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") return options;
  const context = getScopedSdkTaskSpawn();
  if (!context) return options;
  const parent = getScopedExecutionLease();
  const workspace = requireConversationWorkspace();
  if (
    !parent ||
    parent.runId !== context.parentRunId ||
    parent.sessionId !== context.sessionId ||
    workspace.sessionId !== context.sessionId ||
    workspace.workspacePath !== context.workspacePath ||
    (options.workdir !== undefined &&
      !workspaceWithin(context.workspacePath, options.workdir)) ||
    options.metadata?.source !== "orchestrator" ||
    options.metadata.taskId !== context.taskId ||
    (options.metadata.doolittleParentRunId !== undefined &&
      options.metadata.doolittleParentRunId !== parent.runId)
  )
    throw new Error(
      "SDK task spawn no longer matches its approved desktop run.",
    );
  return {
    ...options,
    workdir: context.workspacePath,
    metadata: { ...options.metadata, doolittleParentRunId: parent.runId },
  };
}

/** The SDK retains ACP session/process authority; the desktop host owns slots. */
export class DesktopAdmittedAcpService extends AcpService {
  private pendingAdmissions?: Set<PendingAdmission>;

  private abortPending(
    predicate: (pending: PendingAdmission) => boolean,
  ): void {
    for (const pending of this.pendingAdmissions ?? []) {
      if (predicate(pending)) pending.controller.abort();
    }
  }

  private async admittedLease(
    parentRunId: string,
    sessionId?: string,
    expectedWorkdir?: string,
  ): Promise<AdmittedOperation> {
    const parentSignal = getScopedTurnAbortSignal(this.runtime);
    parentSignal?.throwIfAborted();
    let resolveSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
      resolveSettled = resolve;
    });
    const pending: PendingAdmission = {
      sessionId,
      controller: new AbortController(),
      started: false,
      cleanupFailed: false,
      settled,
      resolveSettled,
    };
    const onParentAbort = () => pending.controller.abort(parentSignal?.reason);
    const onAbort = () => {
      if (sessionId && pending.started) {
        pending.stopOnAbort = super.stopSession(sessionId);
        void pending.stopOnAbort.catch(() => undefined);
      }
    };
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });
    pending.controller.signal.addEventListener("abort", onAbort, {
      once: true,
    });
    if (parentSignal?.aborted) pending.controller.abort(parentSignal.reason);
    this.pendingAdmissions ??= new Set();
    this.pendingAdmissions.add(pending);
    const dispose = () => {
      this.pendingAdmissions?.delete(pending);
      parentSignal?.removeEventListener("abort", onParentAbort);
      pending.controller.signal.removeEventListener("abort", onAbort);
      pending.resolveSettled();
    };
    let lease: ExecutionLease | null = null;
    try {
      lease = await acquireExecutionLease({
        runId: `acp:${randomUUID()}`,
        sessionId: getScopedExecutionLease()?.sessionId ?? parentRunId,
        kind: "automatic-acp",
        parentRunId,
        signal: pending.controller.signal,
      });
      pending.controller.signal.throwIfAborted();
      if (getScopedExecutionLease()?.runId !== parentRunId) {
        throw new Error("The parent desktop run is no longer active.");
      }
      if (expectedWorkdir) {
        const parentSessionId = getScopedExecutionLease()?.sessionId;
        if (!parentSessionId)
          throw new Error("The parent desktop conversation is unavailable.");
        const current = await resolveConversationWorkspace(parentSessionId);
        if (!workspaceWithin(current.workspacePath, expectedWorkdir))
          throw new Error(
            `CODING_WORKSPACE_OUTSIDE_APPROVED: "${expectedWorkdir}" is outside the approved workspace "${current.workspacePath}".`,
          );
      }
      if (sessionId) {
        const session = await super.getSession(sessionId);
        pending.controller.signal.throwIfAborted();
        if (!session || TERMINAL_STATUSES.has(session.status)) {
          throw new Error("ACP session is unavailable.");
        }
      }
      return {
        signal: pending.controller.signal,
        start: () => {
          pending.started = true;
        },
        recordStoppedLateSession: (stoppedSessionId) => {
          pending.stoppedLateSessionId = stoppedSessionId;
        },
        markTeardownFailed: () => {
          pending.cleanupFailed = true;
        },
        finish: async () => {
          let cleanupError: unknown;
          let finishFailed = false;
          try {
            await pending.stopOnAbort;
          } catch (error) {
            pending.cleanupFailed = true;
            finishFailed = true;
            cleanupError = error;
          }
          try {
            await lease?.release();
          } catch (error) {
            pending.cleanupFailed = true;
            finishFailed = true;
            cleanupError ??= error;
          }
          // An abort can arrive while release is in flight.
          try {
            await pending.stopOnAbort;
          } catch (error) {
            pending.cleanupFailed = true;
            finishFailed = true;
            cleanupError ??= error;
          }
          dispose();
          if (finishFailed) throw cleanupError;
        },
      };
    } catch (error) {
      try {
        await lease?.release();
      } finally {
        dispose();
      }
      throw error;
    }
  }
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
        ...(process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1"
          ? { adapter: runtime.adapter }
          : {}),
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
    const stateDir = runtime.getSetting("ELIZA_ACP_STATE_DIR");
    const scratchRoot = runtime.getSetting("ELIZA_ACP_WORKSPACE_ROOT");
    if (
      runtime.getSetting("ELIZA_ACP_TRANSPORT") !== "native" ||
      typeof stateDir !== "string" ||
      !isAbsolute(stateDir) ||
      scratchRoot !== join(stateDir, "workspaces")
    )
      throw new Error(
        "Native ACP requires Doolittle’s profile state settings.",
      );
    assertNativeAcpStateDirectories(stateDir);

    // The pinned SDK still uses its legacy home directory and shared scratch
    // root for maintenance in native mode. Keep that maintenance, including
    // native per-session Git indexes, inside this profile. Keep older session
    // records readable without letting commands reopen or mutate them.
    const requireSession = Reflect.get(this, "requireSession");
    const createNativeClient = Reflect.get(this, "createNativeClient");
    if (
      typeof requireSession !== "function" ||
      typeof createNativeClient !== "function"
    )
      throw new Error("Native ACP session hooks are unavailable.");
    const profileHooks = {
      acpxStateRoot: () => join(stateDir, "native"),
      configuredScratchRoots: () => [scratchRoot],
      requireSession: async (sessionId: string) => {
        const session: SessionInfo = await Reflect.apply(requireSession, this, [
          sessionId,
        ]);
        if (session.metadata?.transportMode !== "native")
          throw new Error(
            "Legacy ACP sessions cannot run commands in this runtime.",
          );
        return session;
      },
      createNativeClient: (
        session: SessionInfo,
        options: { env?: Record<string, string>; model?: string },
      ) => {
        if (
          session.agentType !== "codex" ||
          runtime.getSetting("ELIZA_CODEX_ACP_COMMAND") !==
            bundledCodexAcpCommand()
        )
          return Reflect.apply(createNativeClient, this, [session, options]);

        // SDK launch and reattach share this path. Use Codex's sandbox and
        // deny edits/exec requested through the SDK's host tool callbacks.
        const approvalPreset =
          session.approvalPreset === "readonly" ||
          session.approvalPreset === "verifier"
            ? "readonly"
            : "standard";
        const effort = runtime.getSetting(
          "DOOLITTLE_CODEX_DELEGATED_REASONING_EFFORT",
        );
        const env = bundledCodexAcpEnv({
          model: options.model,
          reasoningEffort: typeof effort === "string" ? effort : undefined,
          approvalPreset,
          env: options.env,
        });
        return runWithAdditionalTurnRuntimeSettings(
          runtime,
          new Map([["ELIZA_ACP_NO_TERMINAL", "true"]]),
          () =>
            Reflect.apply(createNativeClient, this, [
              { ...session, approvalPreset },
              { ...options, env },
            ]),
        );
      },
    };
    for (const [name, implementation] of Object.entries(profileHooks)) {
      if (typeof Reflect.get(this, name) !== "function")
        throw new Error(`Native ACP maintenance hook is unavailable: ${name}`);
      Object.defineProperty(this, name, { value: implementation });
    }
  }

  override async start(): Promise<void> {
    await super.start();
    if (process.env.DOOLITTLE_DESKTOP_RUNTIME === "1") {
      await this.resumeOrphanedBusySessions();
    }
  }

  override async spawnSession(options: SpawnOptions) {
    options = admittedSdkSpawn(options);
    const parentRunId = desktopParentRunId(options.metadata);
    if (parentRunId && !options.workdir)
      throw new Error("An approved desktop ACP workdir is required.");
    const operation = parentRunId
      ? await this.admittedLease(parentRunId, undefined, options.workdir)
      : null;
    try {
      operation?.start();
      const result = await super.spawnSession(options);
      if (operation?.signal.aborted) {
        try {
          await super.stopSession(result.sessionId);
        } catch (error) {
          operation.markTeardownFailed();
          throw error;
        }
        operation.recordStoppedLateSession(result.sessionId);
        operation.signal.throwIfAborted();
      }
      return result;
    } finally {
      await operation?.finish();
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
    const operation = await this.admittedLease(
      parentRunId as string,
      sessionId,
      session.workdir,
    );
    try {
      operation.start();
      const result = await super.sendPrompt(sessionId, text, options);
      operation.signal.throwIfAborted();
      return result;
    } finally {
      await operation.finish();
    }
  }

  override async reattachSession(sessionId: string) {
    if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") {
      return super.reattachSession(sessionId);
    }
    const session = await super.getSession(sessionId);
    if (!session) throw new Error("ACP session is unavailable.");
    const parentRunId = desktopParentRunId(session.metadata);
    const operation = await this.admittedLease(
      parentRunId as string,
      sessionId,
      session.workdir,
    );
    try {
      operation.start();
      const result = await super.reattachSession(sessionId);
      operation.signal.throwIfAborted();
      return result;
    } finally {
      await operation.finish();
    }
  }

  override async resumeOrphanedBusySessions() {
    if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") {
      return super.resumeOrphanedBusySessions();
    }
    const sessions = await super.listSessions();
    const orphaned = sessions.filter(
      (session) =>
        session.metadata?.transportMode === "native" &&
        ACTIVE_STATUSES.has(session.status),
    );
    for (const session of orphaned) await super.stopSession(session.id);
    return { resumed: 0, skipped: orphaned.length };
  }

  /** Emergency stop without unloading the SDK service from the runtime. */
  async stopAllAdmittedSessions(): Promise<number> {
    const inFlight = [...(this.pendingAdmissions ?? [])].filter(
      (pending) => pending.started,
    );
    this.abortPending(() => true);
    return rejectAtDeadline(
      (async () => {
        const sessions = await super.listSessions();
        const active = sessions.filter(
          (session) =>
            session.metadata?.transportMode === "native" &&
            ACTIVE_STATUSES.has(session.status),
        );
        await Promise.all([
          ...active.map((session) => super.stopSession(session.id)),
          ...inFlight.map((pending) => pending.settled),
        ]);
        if (inFlight.some((pending) => pending.cleanupFailed)) {
          throw new Error("ACP stop could not confirm SDK session teardown.");
        }
        return new Set([
          ...active.map((session) => session.id),
          ...inFlight.flatMap((pending) =>
            pending.stoppedLateSessionId ? [pending.stoppedLateSessionId] : [],
          ),
        ]).size;
      })(),
      {
        timeoutMs: STOP_CONFIRMATION_TIMEOUT_MS,
        onTimeout: () =>
          new Error("ACP stop could not confirm SDK session teardown."),
      },
    );
  }

  override async stopSession(sessionId: string): Promise<void> {
    this.abortPending((pending) => pending.sessionId === sessionId);
    return super.stopSession(sessionId);
  }
}
