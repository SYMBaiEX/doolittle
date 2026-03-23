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
  lastAction?: string;
  pendingApprovals: number;
  startedAt: string;
  updatedAt: string;
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

  markRuntimeBridgeAttached(attached = true): void {
    this.runtimeBridgeAttached = attached;
  }

  hasRuntimeBridge(): boolean {
    return this.runtimeBridgeAttached;
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
      { status: "waiting", activeAction: undefined },
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
        lastAction: action,
      },
      "action-completed",
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
    const next: RunSnapshot = {
      ...run,
      status,
      activeAction: undefined,
      errorMessage,
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
