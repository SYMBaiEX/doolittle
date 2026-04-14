import { RunUpdateEventBus } from "@/services/run-controller/event-bus";
import { RunControllerStore } from "@/services/run-controller/store";
import type {
  RunSnapshot,
  RunStatus,
  RunUpdateEvent,
  StartTurnInput,
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
  setPendingApprovals,
  updateThinking,
  updateWaiting,
} from "./session-tracking";
import { finishTurn, startTurn } from "./state-resets";
import type { RunControllerDependencies } from "./types";

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
    status: Extract<RunStatus, "complete" | "error">,
    errorMessage?: string,
  ): void {
    finishTurn(this.dependencies, sessionId, status, errorMessage);
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

  noteRuntimeStream(roomId: string, stream: string, detail?: string): void {
    withSessionForRoom(this.store, roomId, (sessionId) => {
      this.noteStream(sessionId, stream, detail);
    });
  }

  finishRuntimeRun(
    roomId: string,
    status: Extract<RunStatus, "complete" | "error">,
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
