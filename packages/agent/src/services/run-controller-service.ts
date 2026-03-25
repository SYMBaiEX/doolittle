import { EventEmitter } from "node:events";
import type { RunDepth, ToolProgressMode } from "@/types";

export type RunStatus =
  | "thinking"
  | "acting"
  | "waiting"
  | "complete"
  | "error";

export interface RunSnapshot {
  runId: string;
  sessionId: string;
  roomId: string;
  source: string;
  message: string;
  runDepth: RunDepth;
  configuredMaxIterations: number;
  observedActionCount: number;
  progressMode: ToolProgressMode;
  status: RunStatus;
  activeAction?: string;
  activeStream?: string;
  statusDetail?: string;
  lastAction?: string;
  pendingApprovals: number;
  startedAt: string;
  updatedAt: string;
  lastHeartbeatAt?: string;
  endedAt?: string;
  errorMessage?: string;
}

export interface RunUpdateEvent {
  type:
    | "started"
    | "thinking"
    | "acting"
    | "waiting"
    | "message"
    | "action-started"
    | "action-completed"
    | "stream"
    | "heartbeat"
    | "completed"
    | "error"
    | "approvals";
  sessionId: string;
  run: RunSnapshot;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneRun(run: RunSnapshot): RunSnapshot {
  return { ...run };
}

export class RunControllerService {
  private readonly events = new EventEmitter();
  private readonly activeRuns = new Map<string, RunSnapshot>();
  private readonly roomIndex = new Map<string, string>();
  private runtimeBridgeAttached = false;
  private agentEventBridgeAttached = false;

  markRuntimeBridgeAttached(attached = true): void {
    this.runtimeBridgeAttached = attached;
  }

  hasRuntimeBridge(): boolean {
    return this.runtimeBridgeAttached;
  }

  markAgentEventBridgeAttached(attached = true): void {
    this.agentEventBridgeAttached = attached;
  }

  hasAgentEventBridge(): boolean {
    return this.agentEventBridgeAttached;
  }

  startTurn(input: {
    sessionId: string;
    roomId: string;
    runId: string;
    source: string;
    message: string;
    runDepth: RunDepth;
    configuredMaxIterations: number;
    progressMode: ToolProgressMode;
    pendingApprovals?: number;
  }): RunSnapshot {
    const existing = this.activeRuns.get(input.sessionId);
    if (existing && !existing.endedAt) {
      this.finishTurn(input.sessionId, "complete");
    }
    const now = nowIso();
    const run: RunSnapshot = {
      runId: input.runId,
      sessionId: input.sessionId,
      roomId: input.roomId,
      source: input.source,
      message: input.message,
      runDepth: input.runDepth,
      configuredMaxIterations: input.configuredMaxIterations,
      observedActionCount: 0,
      progressMode: input.progressMode,
      status: "thinking",
      pendingApprovals: input.pendingApprovals ?? 0,
      startedAt: now,
      updatedAt: now,
    };
    this.activeRuns.set(input.sessionId, run);
    this.roomIndex.set(input.roomId, input.sessionId);
    this.emit("started", run);
    return cloneRun(run);
  }

  updateThinking(sessionId: string): void {
    this.patch(sessionId, { status: "thinking" }, "thinking");
  }

  updateWaiting(sessionId: string): void {
    this.patch(
      sessionId,
      {
        status: "waiting",
        activeAction: undefined,
        activeStream: undefined,
        statusDetail: undefined,
      },
      "waiting",
    );
  }

  noteMessage(sessionId: string): void {
    this.patch(sessionId, { status: "thinking" }, "message");
  }

  noteActionStarted(sessionId: string, action: string): void {
    const current = this.activeRuns.get(sessionId);
    if (!current) {
      return;
    }
    this.patch(
      sessionId,
      {
        status: "acting",
        activeAction: action,
        activeStream: "action",
        statusDetail: undefined,
        lastAction: action,
        observedActionCount: current.observedActionCount + 1,
      },
      "action-started",
    );
  }

  noteActionCompleted(sessionId: string, action?: string): void {
    this.patch(
      sessionId,
      {
        status: "waiting",
        activeAction: undefined,
        activeStream: undefined,
        statusDetail: undefined,
        lastAction: action,
      },
      "action-completed",
    );
  }

  noteStream(sessionId: string, stream: string, detail?: string): void {
    const current = this.activeRuns.get(sessionId);
    if (!current) {
      return;
    }

    if (stream === "action" || stream === "terminal") {
      this.patch(
        sessionId,
        {
          status: "acting",
          activeStream: stream,
          activeAction: detail ?? current.activeAction,
          statusDetail: detail,
          lastAction: detail ?? current.lastAction,
        },
        "stream",
      );
      return;
    }

    if (stream === "assistant") {
      this.patch(
        sessionId,
        {
          status: "waiting",
          activeAction: undefined,
          activeStream: stream,
          statusDetail: detail,
        },
        "stream",
      );
      return;
    }

    this.patch(
      sessionId,
      {
        status: "thinking",
        activeStream: stream,
        statusDetail: detail,
      },
      "stream",
    );
  }

  noteHeartbeat(
    status: string,
    preview?: string,
    indicatorType?: string,
  ): void {
    const activeRuns = Array.from(this.activeRuns.values()).filter(
      (run) => !run.endedAt,
    );
    if (activeRuns.length !== 1) {
      return;
    }

    const [run] = activeRuns;
    const nextStatus: RunStatus =
      status === "waiting"
        ? "waiting"
        : status === "error"
          ? "error"
          : status === "acting"
            ? "acting"
            : "thinking";

    this.patch(
      run.sessionId,
      {
        status: nextStatus,
        activeStream: indicatorType ?? run.activeStream,
        statusDetail: preview ?? status,
        lastHeartbeatAt: nowIso(),
      },
      "heartbeat",
    );
  }

  setPendingApprovals(sessionId: string, pendingApprovals: number): void {
    this.patch(sessionId, { pendingApprovals }, "approvals");
  }

  finishTurn(
    sessionId: string,
    status: Extract<RunStatus, "complete" | "error">,
    errorMessage?: string,
  ): void {
    const run = this.activeRuns.get(sessionId);
    if (!run) {
      return;
    }
    if (
      run.endedAt &&
      run.status === status &&
      run.errorMessage === errorMessage
    ) {
      return;
    }
    const next: RunSnapshot = {
      ...run,
      status,
      activeAction: undefined,
      errorMessage,
      activeStream: undefined,
      statusDetail: undefined,
      endedAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.activeRuns.set(sessionId, next);
    this.emit(status === "error" ? "error" : "completed", next);
  }

  getByRoomId(roomId: string): RunSnapshot | undefined {
    const sessionId = this.roomIndex.get(roomId);
    if (!sessionId) {
      return undefined;
    }
    return this.getActive(sessionId);
  }

  noteRuntimeMessage(roomId: string): void {
    const sessionId = this.roomIndex.get(roomId);
    if (!sessionId) {
      return;
    }
    this.noteMessage(sessionId);
  }

  updateRuntimeThinking(roomId: string): void {
    const sessionId = this.roomIndex.get(roomId);
    if (!sessionId) {
      return;
    }
    this.updateThinking(sessionId);
  }

  updateRuntimeWaiting(roomId: string): void {
    const sessionId = this.roomIndex.get(roomId);
    if (!sessionId) {
      return;
    }
    this.updateWaiting(sessionId);
  }

  noteRuntimeActionStarted(roomId: string, action: string): void {
    const sessionId = this.roomIndex.get(roomId);
    if (!sessionId) {
      return;
    }
    this.noteActionStarted(sessionId, action);
  }

  noteRuntimeActionCompleted(roomId: string, action?: string): void {
    const sessionId = this.roomIndex.get(roomId);
    if (!sessionId) {
      return;
    }
    this.noteActionCompleted(sessionId, action);
  }

  noteRuntimeStream(roomId: string, stream: string, detail?: string): void {
    const sessionId = this.roomIndex.get(roomId);
    if (!sessionId) {
      return;
    }
    this.noteStream(sessionId, stream, detail);
  }

  finishRuntimeRun(
    roomId: string,
    status: Extract<RunStatus, "complete" | "error">,
    errorMessage?: string,
  ): void {
    const sessionId = this.roomIndex.get(roomId);
    if (!sessionId) {
      return;
    }
    this.finishTurn(sessionId, status, errorMessage);
  }

  getActive(sessionId: string): RunSnapshot | undefined {
    const run = this.activeRuns.get(sessionId);
    return run ? cloneRun(run) : undefined;
  }

  listActive(): RunSnapshot[] {
    return Array.from(this.activeRuns.values(), (run) => cloneRun(run));
  }

  onUpdate(listener: (event: RunUpdateEvent) => void): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  private patch(
    sessionId: string,
    patch: Partial<RunSnapshot>,
    type: RunUpdateEvent["type"],
  ): void {
    const current = this.activeRuns.get(sessionId);
    if (!current) {
      return;
    }
    if (current.endedAt) {
      return;
    }
    const next: RunSnapshot = {
      ...current,
      ...patch,
      updatedAt: nowIso(),
    };
    this.activeRuns.set(sessionId, next);
    this.emit(type, next);
  }

  private emit(type: RunUpdateEvent["type"], run: RunSnapshot): void {
    this.events.emit("update", {
      type,
      sessionId: run.sessionId,
      run: cloneRun(run),
    } satisfies RunUpdateEvent);
  }
}
