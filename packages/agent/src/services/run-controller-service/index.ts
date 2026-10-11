import {
  RuntimeCodingVerificationEventBus,
  RunUpdateEventBus,
  TaskRunEventBus,
} from "@/services/run-controller/event-bus";
import { RunControllerStore } from "@/services/run-controller/store";
import { createRunStartTransition } from "@/services/run-controller/transitions";
import type {
  LocalMutationInput,
  RunSnapshot,
  RunStatus,
  RuntimeCodingVerificationEvent,
  RunUpdateEvent,
  StartTurnInput,
  TaskRunClaimInput,
  TaskRunClaimResult,
  TaskRunEvent,
} from "@/services/run-controller/types";
import { cloneRun } from "@/services/run-controller/utils";
import { emitRunUpdate, onRunUpdate } from "./event-capture";
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
  RuntimeCodingVerificationEvent,
  RunUpdateEvent,
  StartTurnInput,
  TaskRunClaimInput,
  TaskRunClaimResult,
  TaskRunEvent,
} from "@/services/run-controller/types";

export class RunControllerService {
  private static readonly SERVER_RUN_FAILURE_MESSAGE =
    "The response could not be completed. Please try again.";
  private readonly events = new RunUpdateEventBus();
  private readonly taskEvents = new TaskRunEventBus();
  private readonly codingVerificationEvents =
    new RuntimeCodingVerificationEventBus();
  private readonly store: RunControllerStore;
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly workspaceRuns = new Map<string, string>();
  private readonly activeTasks = new Map<string, TaskRunClaimInput>();
  private readonly sessionTasks = new Map<string, string>();
  private readonly queuedRunIds = new Set<string>();
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
    const prior = this.store.getByRunId(input.runId);
    if (prior?.endedAt) {
      throw new Error(`Run ${input.runId} already has a terminal receipt.`);
    }
    if (this.queuedRunIds.has(input.runId)) {
      const queued = this.store.getInternal(input.sessionId);
      if (!queued || queued.runId !== input.runId || queued.endedAt) {
        throw new Error(`Run ${input.runId} is no longer queued.`);
      }
      const transition = createRunStartTransition(input);
      transition.run.firstStatusAt = queued.firstStatusAt;
      this.store.apply(input.sessionId, transition.run);
      this.queuedRunIds.delete(input.runId);
      emitRunUpdate(this.dependencies, transition.type, transition.run);
      return cloneRun(transition.run);
    }
    return startTurn(this.dependencies, input);
  }

  /** Retain an accepted, admission-waiting receipt without recording a model turn. */
  acceptQueuedRun(input: Omit<StartTurnInput, "message">): RunSnapshot {
    const claim = this.activeTasks.get(input.runId);
    if (
      !claim ||
      claim.sessionId !== input.sessionId ||
      this.store.hasRunId(input.runId)
    ) {
      throw new Error(
        `Run ${input.runId} is not available for queued acceptance.`,
      );
    }
    const now = new Date().toISOString();
    const run: RunSnapshot = {
      ...input,
      message: "",
      observedActionCount: 0,
      status: "waiting",
      statusDetail: "Waiting for execution capacity",
      localMutations: [],
      pendingApprovals: 0,
      startedAt: now,
      firstStatusAt: now,
      lastMeaningfulActivityAt: now,
      updatedAt: now,
    };
    this.store.saveAccepted(run);
    this.queuedRunIds.add(input.runId);
    try {
      emitRunUpdate(this.dependencies, "waiting", run);
    } catch {
      // A subscriber cannot undo the durable acceptance receipt.
    }
    return cloneRun(run);
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
    const current = this.store.getInternal(sessionId);
    finishTurn(
      this.dependencies,
      sessionId,
      status,
      status === "error" && current && this.activeTasks.has(current.runId)
        ? RunControllerService.SERVER_RUN_FAILURE_MESSAGE
        : errorMessage,
    );
    const finished = this.store.getInternal(sessionId);
    if (finished?.endedAt) this.queuedRunIds.delete(finished.runId);
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
    this.queuedRunIds.delete(runId);
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

  cancelAllActiveRuns(): number {
    const active = new Set([
      ...this.abortControllers.keys(),
      ...this.activeTasks.keys(),
    ]);
    for (const runId of active) this.cancelRun(runId);
    return active.size;
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

  /** Publishes only in memory; never touches task snapshots or run journals. */
  publishRuntimeCodingVerification(
    event: RuntimeCodingVerificationEvent,
  ): void {
    this.codingVerificationEvents.emit(event);
  }

  onRuntimeCodingVerification(
    listener: (event: RuntimeCodingVerificationEvent) => void,
  ): () => void {
    return this.codingVerificationEvents.onReceipt(listener);
  }
}
