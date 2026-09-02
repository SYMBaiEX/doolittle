import {
  RunUpdateEventBus,
  TaskRunEventBus,
} from "@/services/run-controller/event-bus";
import { RunControllerStore } from "@/services/run-controller/store";
import type {
  LocalMutationInput,
  RunSnapshot,
  RunStatus,
  RunUpdateEvent,
  StartTurnInput,
  TaskRunClaimInput,
  TaskRunClaimResult,
  TaskRunEvent,
} from "@/services/run-controller/types";
import { onRunUpdate } from "./event-capture";
import { getRunByRoomId, withSessionForRoom } from "./room-mapping";
import {
  getActiveRun,
  listActiveRuns,
  noteActionCompleted,
  noteActionStarted,
  noteHeartbeat,
  noteMessage,
  noteStream,
  recordLocalMutation,
  setPendingApprovals,
  updateThinking,
  updateWaiting,
} from "./session-tracking";
import { finishTurn, startTurn } from "./state-resets";
import type { RunControllerDependencies } from "./types";

export type {
  LocalMutationInput,
  LocalMutationRecord,
  RunSnapshot,
  RunStatus,
  RunUpdateEvent,
  StartTurnInput,
  TaskRunClaimInput,
  TaskRunClaimResult,
  TaskRunEvent,
} from "@/services/run-controller/types";

export class RunControllerService {
  private readonly events = new RunUpdateEventBus();
  private readonly taskEvents = new TaskRunEventBus();
  private readonly store: RunControllerStore;
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly workspaceRuns = new Map<string, string>();
  private readonly activeTasks = new Map<string, TaskRunClaimInput>();
  private readonly sessionTasks = new Map<string, string>();
  private runtimeBridgeAttached = false;
  private agentEventBridgeAttached = false;

  constructor(dataDir?: string) {
    this.store = new RunControllerStore(dataDir);
  }

  private get dependencies(): RunControllerDependencies {
    return {
      events: this.events,
      store: this.store,
    };
  }

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

  startTurn(input: StartTurnInput): RunSnapshot {
    return startTurn(this.dependencies, input);
  }

  updateThinking(sessionId: string): void {
    updateThinking(this.dependencies, sessionId);
  }

  updateWaiting(sessionId: string): void {
    updateWaiting(this.dependencies, sessionId);
  }

  noteMessage(sessionId: string): void {
    noteMessage(this.dependencies, sessionId);
  }

  noteActionStarted(sessionId: string, action: string): void {
    noteActionStarted(this.dependencies, sessionId, action);
  }

  noteActionCompleted(sessionId: string, action?: string): void {
    noteActionCompleted(this.dependencies, sessionId, action);
  }

  recordLocalMutation(sessionId: string, mutation: LocalMutationInput): void {
    recordLocalMutation(this.dependencies, sessionId, mutation);
  }

  noteStream(sessionId: string, stream: string, detail?: string): void {
    noteStream(this.dependencies, sessionId, stream, detail);
  }

  noteHeartbeat(
    status: string,
    preview?: string,
    indicatorType?: string,
  ): void {
    noteHeartbeat(this.dependencies, status, preview, indicatorType);
  }

  setPendingApprovals(sessionId: string, pendingApprovals: number): void {
    setPendingApprovals(this.dependencies, sessionId, pendingApprovals);
  }

  finishTurn(
    sessionId: string,
    status: Extract<RunStatus, "complete" | "cancelled" | "error">,
    errorMessage?: string,
  ): void {
    finishTurn(this.dependencies, sessionId, status, errorMessage);
  }

  /** Registers the server-side signal that actually drives provider/tool cancellation. */
  registerAbortController(
    runId: string,
    controller: AbortController,
  ): () => void {
    this.abortControllers.set(runId, controller);
    return () => {
      if (this.abortControllers.get(runId) === controller) {
        this.abortControllers.delete(runId);
      }
    };
  }

  claimTaskRun(input: TaskRunClaimInput): TaskRunClaimResult {
    if (this.activeTasks.has(input.runId) || this.store.hasRunId(input.runId)) {
      return { accepted: false, reason: "run_exists" };
    }
    const conflictingRunId = this.sessionTasks.get(input.sessionId);
    const activeSessionRun = this.store.getInternal(input.sessionId);
    const conflictingSessionRunId =
      conflictingRunId ??
      (activeSessionRun && !activeSessionRun.endedAt
        ? activeSessionRun.runId
        : undefined);
    if (conflictingSessionRunId) {
      return {
        accepted: false,
        reason: "session_active",
        conflictingRunId: conflictingSessionRunId,
      };
    }
    this.activeTasks.set(input.runId, { ...input });
    this.sessionTasks.set(input.sessionId, input.runId);
    return { accepted: true };
  }

  releaseTaskRun(runId: string): void {
    const task = this.activeTasks.get(runId);
    if (!task) return;
    this.activeTasks.delete(runId);
    if (this.sessionTasks.get(task.sessionId) === runId) {
      this.sessionTasks.delete(task.sessionId);
    }
  }

  appendTaskEvent(
    runId: string,
    type: string,
    data: unknown,
    terminal = false,
  ): TaskRunEvent {
    const result = this.store.appendEvent(runId, type, data, terminal);
    if (result.appended) this.taskEvents.emit(result.event);
    return result.event;
  }

  getTaskEvents(runId: string, after = 0): TaskRunEvent[] {
    return this.store.listEvents(runId, after);
  }

  getTerminalTaskEvent(runId: string): TaskRunEvent | undefined {
    return this.store.getTerminalEvent(runId);
  }

  onTaskEvent(listener: (event: TaskRunEvent) => void): () => void {
    return this.taskEvents.onEvent(listener);
  }

  /** Flushes the short-tail event journal debounce during an orderly shutdown. */
  dispose(): void {
    this.store.dispose();
  }

  isTaskActive(runId: string): boolean {
    return this.activeTasks.has(runId);
  }

  /**
   * Freezes the workspace identity for a chat before its turn begins. Runtime
   * workspace switches consult these leases so a later tool call cannot be
   * silently retargeted while the shared AppContext is still serving the run.
   */
  registerWorkspaceRun(runId: string, workspaceDir: string): () => void {
    if (this.workspaceRuns.has(runId)) {
      throw new Error(
        `Workspace identity is already registered for run ${runId}.`,
      );
    }
    this.workspaceRuns.set(runId, workspaceDir);
    return () => {
      if (this.workspaceRuns.get(runId) === workspaceDir) {
        this.workspaceRuns.delete(runId);
      }
    };
  }

  workspaceSwitchConflict(
    workspaceDir: string,
  ): { runId: string; workspaceDir: string } | undefined {
    for (const [runId, activeWorkspaceDir] of this.workspaceRuns) {
      if (activeWorkspaceDir !== workspaceDir) {
        return { runId, workspaceDir: activeWorkspaceDir };
      }
    }
    return undefined;
  }

  cancelRun(runId: string): { accepted: boolean; run?: RunSnapshot } {
    const controller = this.abortControllers.get(runId);
    const receipt = this.store.getByRunId(runId);
    const task = this.activeTasks.get(runId);
    const terminalEvent = this.store.getTerminalEvent(runId);
    if (!controller && !receipt && !task && !terminalEvent) {
      return { accepted: false };
    }
    if (
      !terminalEvent &&
      !receipt?.endedAt &&
      controller &&
      !controller.signal.aborted
    ) {
      controller.abort();
    }
    if (!terminalEvent && receipt && !receipt.endedAt) {
      const current = this.store.getInternal(receipt.sessionId);
      if (current?.runId === runId) {
        this.finishTurn(receipt.sessionId, "cancelled");
      }
    }
    if (!terminalEvent) {
      this.appendTaskEvent(
        runId,
        "response.cancelled",
        {
          id: task?.responseId,
          run_id: runId,
          room_id: task?.roomId ?? receipt?.roomId,
        },
        true,
      );
    }
    return { accepted: true, run: this.store.getByRunId(runId) };
  }

  getByRunId(runId: string): RunSnapshot | undefined {
    return this.store.getByRunId(runId);
  }

  listReceipts(limit?: number): RunSnapshot[] {
    return this.store.listReceipts(limit);
  }

  getByRoomId(roomId: string): RunSnapshot | undefined {
    return getRunByRoomId(this.store, roomId);
  }

  noteRuntimeMessage(roomId: string): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.noteMessage(sessionId);
    });
  }

  updateRuntimeThinking(roomId: string): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.updateThinking(sessionId);
    });
  }

  updateRuntimeWaiting(roomId: string): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.updateWaiting(sessionId);
    });
  }

  noteRuntimeActionStarted(roomId: string, action: string): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.noteActionStarted(sessionId, action);
    });
  }

  noteRuntimeActionCompleted(roomId: string, action?: string): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.noteActionCompleted(sessionId, action);
    });
  }

  recordRuntimeLocalMutation(
    roomId: string,
    mutation: LocalMutationInput,
  ): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.recordLocalMutation(sessionId, mutation);
    });
  }

  noteRuntimeStream(roomId: string, stream: string, detail?: string): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.noteStream(sessionId, stream, detail);
    });
  }

  finishRuntimeRun(
    roomId: string,
    status: Extract<RunStatus, "complete" | "cancelled" | "error">,
    errorMessage?: string,
  ): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.finishTurn(sessionId, status, errorMessage);
    });
  }

  getActive(sessionId: string): RunSnapshot | undefined {
    return getActiveRun(this.store, sessionId);
  }

  listActive(): RunSnapshot[] {
    return listActiveRuns(this.store);
  }

  onUpdate(listener: (event: RunUpdateEvent) => void): () => void {
    return onRunUpdate(this.events, listener);
  }
}
