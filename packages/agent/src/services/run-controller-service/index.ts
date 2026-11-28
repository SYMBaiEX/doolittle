import { randomUUID } from "node:crypto";
import {
  isTerminalRunStatus,
  RUN_NO_MEANINGFUL_ACTIVITY_DEGRADED_AFTER_MS,
} from "@doolittle/contracts/run";
import { walletActivityFromAction } from "@doolittle/contracts/wallet-activity";
import {
  RuntimeCodingVerificationEventBus,
  RunUpdateEventBus,
  TaskRunEventBus,
} from "../run-controller/event-bus";
import { RunControllerStore } from "../run-controller/store";
import {
  actionProgressTransition,
  createPatchedTransition,
  createRunStartTransition,
  inactivityDegradedTransition,
} from "../run-controller/transitions";
import type {
  LocalMutationInput,
  RunReceiptEnvelope,
  RunSnapshot,
  RunStatus,
  RunToolActivity,
  RuntimeCodingVerificationEvent,
  RunUpdateEvent,
  StartTurnInput,
  TaskRunClaimInput,
  TaskRunClaimResult,
  TaskRunEvent,
} from "../run-controller/types";
import { cloneRun, nowIso } from "../run-controller/utils";
import {
  applyRunTransition,
  emitRunUpdate,
  onRunUpdate,
} from "./event-capture";
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
  RunReceiptEnvelope,
  RunSnapshot,
  RunStatus,
  RuntimeCodingVerificationEvent,
  RunUpdateEvent,
  StartTurnInput,
  TaskRunClaimInput,
  TaskRunClaimResult,
  TaskRunEvent,
} from "../run-controller/types";

const EXECUTION_CAPACITY_WAIT_DETAIL = "Waiting for execution capacity";

function parseRunTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Heartbeats and watchdog emissions refresh `updatedAt`, so only meaningful
 * activity (or the start boundary for older receipts) can anchor silence.
 */
function meaningfulActivityAnchorMs(run: RunSnapshot): number | undefined {
  return (
    parseRunTimestamp(run.lastMeaningfulActivityAt) ??
    parseRunTimestamp(run.startedAt)
  );
}

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
  private readonly pendingAcceptances = new Map<string, Promise<RunSnapshot>>();
  private readonly inactivityTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly stopInactivityObservation: () => void;
  private runtimeBridgeAttached = false;
  private agentEventBridgeAttached = false;

  constructor(dataDir?: string) {
    this.store = new RunControllerStore(dataDir);
    this.stopInactivityObservation = this.events.onUpdate((event) => {
      this.observeRunUpdateForInactivity(event);
    });
  }

  private get dependencies(): RunControllerDependencies {
    return {
      events: this.events,
      store: this.store,
    };
  }

  private isAdmissionWaiting(run: RunSnapshot): boolean {
    return (
      this.queuedRunIds.has(run.runId) ||
      (run.status === "waiting" &&
        run.statusDetail === EXECUTION_CAPACITY_WAIT_DETAIL)
    );
  }

  private shouldObserveRunInactivity(run: RunSnapshot): boolean {
    return (
      !run.endedAt &&
      !run.terminalReason &&
      !isTerminalRunStatus(run.status) &&
      !run.degraded &&
      run.pendingApprovals <= 0 &&
      !this.isAdmissionWaiting(run)
    );
  }

  private clearInactivityTimer(runId: string): void {
    const timer = this.inactivityTimers.get(runId);
    if (timer) clearTimeout(timer);
    this.inactivityTimers.delete(runId);
  }

  private scheduleInactivityCheck(run: RunSnapshot): void {
    this.clearInactivityTimer(run.runId);
    if (!this.shouldObserveRunInactivity(run)) return;
    const anchorMs = meaningfulActivityAnchorMs(run);
    if (anchorMs === undefined) return;
    const delay = Math.max(
      0,
      anchorMs + RUN_NO_MEANINGFUL_ACTIVITY_DEGRADED_AFTER_MS - Date.now(),
    );
    const timer = setTimeout(() => {
      this.inactivityTimers.delete(run.runId);
      this.checkRunInactivity(run.runId);
    }, delay);
    timer.unref?.();
    this.inactivityTimers.set(run.runId, timer);
  }

  private observeRunUpdateForInactivity(event: RunUpdateEvent): void {
    // Heartbeats are transport liveness only; degraded emissions are the
    // watchdog's own output. Neither may reset the meaningful-activity clock.
    if (event.type === "heartbeat" || event.type === "degraded") return;
    this.scheduleInactivityCheck(event.run);
  }

  private checkRunInactivity(runId: string): void {
    const receipt = this.store.getByRunId(runId);
    if (!receipt) return;
    const current = this.store.getInternal(receipt.sessionId);
    if (
      !current ||
      current.runId !== runId ||
      !this.shouldObserveRunInactivity(current)
    )
      return;
    const anchorMs = meaningfulActivityAnchorMs(current);
    if (anchorMs === undefined) return;
    if (
      anchorMs + RUN_NO_MEANINGFUL_ACTIVITY_DEGRADED_AFTER_MS - Date.now() >
      0
    ) {
      // A clock adjustment can fire a timer before wall-clock evidence reaches
      // the threshold. Re-arm rather than degrading early.
      this.scheduleInactivityCheck(current);
      return;
    }
    applyRunTransition(this.dependencies, current.sessionId, (latest) =>
      inactivityDegradedTransition(latest),
    );
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
  async acceptQueuedRun(
    input: Omit<StartTurnInput, "message">,
  ): Promise<RunSnapshot> {
    const claim = this.activeTasks.get(input.runId);
    if (
      !claim ||
      claim.sessionId !== input.sessionId ||
      this.pendingAcceptances.has(input.runId) ||
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
      statusDetail: EXECUTION_CAPACITY_WAIT_DETAIL,
      localMutations: [],
      pendingApprovals: 0,
      startedAt: now,
      firstStatusAt: now,
      lastMeaningfulActivityAt: now,
      updatedAt: now,
    };
    // Keep the claim visible to cancellation while durable acceptance is
    // pending. Commit first so a failed write cannot publish a created run.
    const acceptance = Promise.resolve().then(async () => {
      await this.store.saveAccepted(run);
      this.queuedRunIds.add(run.runId);
      try {
        this.appendTaskEvent(run.runId, "response.created", {
          id: claim.responseId,
          run_id: run.runId,
          room_id: claim.roomId,
          state: "accepted",
        });
        // Execution has not subscribed to runtime updates yet. Persist the
        // admitted queue state explicitly so late subscribers and history see
        // why the run is waiting instead of a silent gap after creation.
        this.appendTaskEvent(run.runId, "agent.run", {
          type: "waiting",
          sessionId: run.sessionId,
          run: cloneRun(run),
        });
        emitRunUpdate(this.dependencies, "waiting", run);
      } catch {
        // A subscriber cannot undo the durable acceptance receipt.
      }
      return cloneRun(run);
    });
    this.pendingAcceptances.set(run.runId, acceptance);
    try {
      return await acceptance;
    } finally {
      this.pendingAcceptances.delete(run.runId);
    }
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

  noteActionStarted(
    sessionId: string,
    action: string,
    activity?: RunToolActivity,
  ): void {
    noteActionStarted(this.dependencies, sessionId, action, activity);
  }

  noteActionCompleted(
    sessionId: string,
    action?: string,
    activity?: RunToolActivity,
  ): void {
    noteActionCompleted(this.dependencies, sessionId, action, activity);
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

  appendTaskEvent(runId: string, type: string, data: unknown): TaskRunEvent {
    const result = this.store.appendEvent(runId, type, data);
    if (result.appended) this.taskEvents.emit(result.event);
    return result.event;
  }

  async finishTaskEvent(
    runId: string,
    type: string,
    data: unknown,
  ): Promise<TaskRunEvent> {
    const result = await this.store.appendEvent(runId, type, data, true);
    if (result.appended) this.taskEvents.emit(result.event);
    return result.event;
  }

  getTaskEvents(runId: string, after = 0): TaskRunEvent[] {
    return this.store.listEvents(runId, after);
  }

  hasTaskJournal(runId: string): boolean {
    return this.store.hasJournal(runId);
  }

  getTerminalTaskEvent(runId: string): TaskRunEvent | undefined {
    return this.store.getTerminalEvent(runId);
  }

  onTaskEvent(
    runId: string,
    listener: (event: TaskRunEvent) => void,
  ): () => void {
    return this.taskEvents.onEvent(runId, listener);
  }

  /** Flushes the short-tail event journal debounce during an orderly shutdown. */
  dispose(): void {
    this.stopInactivityObservation();
    for (const timer of this.inactivityTimers.values()) clearTimeout(timer);
    this.inactivityTimers.clear();
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

  async cancelRun(
    runId: string,
  ): Promise<{ accepted: boolean; run?: RunReceiptEnvelope }> {
    const controller = this.abortControllers.get(runId);
    const task = this.activeTasks.get(runId);
    const acceptance = this.pendingAcceptances.get(runId);
    let receipt = this.store.getByRunId(runId);
    let terminalEvent = this.store.getTerminalEvent(runId);
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
    if (acceptance) {
      try {
        await acceptance;
      } catch {
        return { accepted: false };
      }
      receipt = this.store.getByRunId(runId);
      terminalEvent = this.store.getTerminalEvent(runId);
    }
    if (!terminalEvent && receipt && !receipt.endedAt) {
      const current = this.store.getInternal(receipt.sessionId);
      if (current?.runId === runId) {
        this.finishTurn(receipt.sessionId, "cancelled");
      }
    }
    if (!terminalEvent) {
      await this.finishTaskEvent(runId, "response.cancelled", {
        id: task?.responseId,
        run_id: runId,
        room_id: task?.roomId ?? receipt?.roomId,
      });
    }
    return { accepted: true, run: this.store.getByRunId(runId) };
  }

  async cancelAllActiveRuns(): Promise<number> {
    const active = new Set([
      ...this.abortControllers.keys(),
      ...this.activeTasks.keys(),
    ]);
    await Promise.all(Array.from(active, (runId) => this.cancelRun(runId)));
    return active.size;
  }

  getByRunId(runId: string): RunReceiptEnvelope | undefined {
    return this.store.getByRunId(runId);
  }

  listReceipts(limit?: number): RunReceiptEnvelope[] {
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

  noteRuntimeActionStarted(
    roomId: string,
    action: string,
    activity?: RunToolActivity,
  ): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.noteActionStarted(sessionId, action, activity);
    });
  }

  noteRuntimeActionCompleted(
    roomId: string,
    action?: string,
    activity?: RunToolActivity,
  ): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.noteActionCompleted(sessionId, action, activity);
    });
  }

  noteRuntimeActionProgress(
    roomId: string,
    runId: string,
    activity: RunToolActivity,
  ): void {
    const run = this.getByRoomId(roomId);
    if (run?.runId !== runId || run.progressMode === "off") return;
    applyRunTransition(
      this.dependencies,
      run.sessionId,
      (current) => actionProgressTransition(current, activity),
      activity,
    );
  }

  recordRuntimeWalletActivity(
    roomId: string,
    action: string | undefined,
    result: unknown,
    sourceRunId?: string,
  ): void {
    const receipt = walletActivityFromAction(action, result);
    const run = this.getByRoomId(roomId);
    if (!receipt || !run || (sourceRunId && sourceRunId !== run.runId)) return;
    applyRunTransition(this.dependencies, run.sessionId, (current) =>
      createPatchedTransition(
        current,
        {
          walletActivities: [
            ...(current.walletActivities ?? []),
            { ...receipt, id: randomUUID() },
          ].slice(-32),
          lastMeaningfulActivityAt: nowIso(),
          degraded: undefined,
        },
        "action-completed",
      ),
    );
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
