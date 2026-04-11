import { RunUpdateEventBus } from "@/services/run-controller/event-bus";
import { RunControllerStore } from "@/services/run-controller/store";
import {
  actionCompletedTransition,
  actionStartedTransition,
  createRunStartTransition,
  finishTransition,
  heartbeatTransition,
  messageTransition,
  pendingApprovalsTransition,
  streamTransition,
  thinkingTransition,
  waitingTransition,
} from "@/services/run-controller/transitions";
import type {
  RunSnapshot,
  RunStatus,
  RunUpdateEvent,
  RunUpdateType,
  StartTurnInput,
} from "@/services/run-controller/types";
import { cloneRun } from "@/services/run-controller/utils";

export type {
  RunSnapshot,
  RunStatus,
  RunUpdateEvent,
  StartTurnInput,
} from "@/services/run-controller/types";

export class RunControllerService {
  private readonly events = new RunUpdateEventBus();
  private readonly store = new RunControllerStore();
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

  startTurn(input: StartTurnInput): RunSnapshot {
    const existing = this.store.getInternal(input.sessionId);
    if (existing && !existing.endedAt) {
      this.finishTurn(input.sessionId, "complete");
    }
    const transition = createRunStartTransition(input);
    this.store.save(transition.run);
    this.emit(transition.type, transition.run);
    return cloneRun(transition.run);
  }

  updateThinking(sessionId: string): void {
    this.applyTransition(sessionId, thinkingTransition);
  }

  updateWaiting(sessionId: string): void {
    this.applyTransition(sessionId, waitingTransition);
  }

  noteMessage(sessionId: string): void {
    this.applyTransition(sessionId, messageTransition);
  }

  noteActionStarted(sessionId: string, action: string): void {
    this.applyTransition(sessionId, (current) =>
      actionStartedTransition(current, action),
    );
  }

  noteActionCompleted(sessionId: string, action?: string): void {
    this.applyTransition(sessionId, (current) =>
      actionCompletedTransition(current, action),
    );
  }

  noteStream(sessionId: string, stream: string, detail?: string): void {
    this.applyTransition(sessionId, (current) =>
      streamTransition(current, stream, detail),
    );
  }

  noteHeartbeat(
    status: string,
    preview?: string,
    indicatorType?: string,
  ): void {
    const activeRuns = this.store.list().filter((run) => !run.endedAt);
    if (activeRuns.length !== 1) {
      return;
    }
    const [run] = activeRuns;
    this.applyTransition(run.sessionId, () =>
      heartbeatTransition(run, status, preview, indicatorType),
    );
  }

  setPendingApprovals(sessionId: string, pendingApprovals: number): void {
    this.applyTransition(sessionId, (current) =>
      pendingApprovalsTransition(current, pendingApprovals),
    );
  }

  finishTurn(
    sessionId: string,
    status: Extract<RunStatus, "complete" | "error">,
    errorMessage?: string,
  ): void {
    const run = this.store.getInternal(sessionId);
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
    const transition = finishTransition(run, status, errorMessage);
    this.store.apply(sessionId, transition.run);
    this.emit(transition.type, transition.run);
  }

  getByRoomId(roomId: string): RunSnapshot | undefined {
    const sessionId = this.store.getSessionByRoom(roomId);
    if (!sessionId) {
      return undefined;
    }
    return this.getActive(sessionId);
  }

  noteRuntimeMessage(roomId: string): void {
    const sessionId = this.store.getSessionByRoom(roomId);
    if (!sessionId) {
      return;
    }
    this.noteMessage(sessionId);
  }

  updateRuntimeThinking(roomId: string): void {
    const sessionId = this.store.getSessionByRoom(roomId);
    if (!sessionId) {
      return;
    }
    this.updateThinking(sessionId);
  }

  updateRuntimeWaiting(roomId: string): void {
    const sessionId = this.store.getSessionByRoom(roomId);
    if (!sessionId) {
      return;
    }
    this.updateWaiting(sessionId);
  }

  noteRuntimeActionStarted(roomId: string, action: string): void {
    const sessionId = this.store.getSessionByRoom(roomId);
    if (!sessionId) {
      return;
    }
    this.noteActionStarted(sessionId, action);
  }

  noteRuntimeActionCompleted(roomId: string, action?: string): void {
    const sessionId = this.store.getSessionByRoom(roomId);
    if (!sessionId) {
      return;
    }
    this.noteActionCompleted(sessionId, action);
  }

  noteRuntimeStream(roomId: string, stream: string, detail?: string): void {
    const sessionId = this.store.getSessionByRoom(roomId);
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
    const sessionId = this.store.getSessionByRoom(roomId);
    if (!sessionId) {
      return;
    }
    this.finishTurn(sessionId, status, errorMessage);
  }

  getActive(sessionId: string): RunSnapshot | undefined {
    const run = this.store.get(sessionId);
    return run ? cloneRun(run) : undefined;
  }

  listActive(): RunSnapshot[] {
    return this.store.list();
  }

  onUpdate(listener: (event: RunUpdateEvent) => void): () => void {
    return this.events.onUpdate(listener);
  }

  private applyTransition(
    sessionId: string,
    transitionFactory: (current: RunSnapshot) => {
      run: RunSnapshot;
      type: RunUpdateType;
    },
  ): void {
    const current = this.store.getInternal(sessionId);
    if (!current || current.endedAt) {
      return;
    }
    const transition = transitionFactory(current);
    this.store.apply(sessionId, transition.run);
    this.emit(transition.type, transition.run);
  }

  private emit(type: RunUpdateEvent["type"], run: RunSnapshot): void {
    this.events.emit(type, run);
  }
}
