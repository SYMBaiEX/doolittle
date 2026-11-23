import { EventEmitter } from "node:events";
import type {
  RunSnapshot,
  RunToolActivity,
  RuntimeCodingVerificationEvent,
  RunUpdateEvent,
  TaskRunEvent,
} from "./types";
import { cloneRun } from "./utils";

export class RunUpdateEventBus {
  private readonly events = new EventEmitter();

  onUpdate(listener: (event: RunUpdateEvent) => void): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  emit(
    type: RunUpdateEvent["type"],
    run: RunSnapshot,
    activity?: RunToolActivity,
  ): void {
    this.events.emit("update", {
      type,
      sessionId: run.sessionId,
      run: cloneRun(run),
      ...(activity && {
        activity: {
          ...activity,
          ...(activity.paths && { paths: [...activity.paths] }),
        },
      }),
    } satisfies RunUpdateEvent);
  }
}

export class TaskRunEventBus {
  private readonly events = new EventEmitter();

  onEvent(runId: string, listener: (event: TaskRunEvent) => void): () => void {
    const channel = `run:${runId}`;
    this.events.on(channel, listener);
    return () => this.events.off(channel, listener);
  }

  emit(event: TaskRunEvent): void {
    this.events.emit(`run:${event.runId}`, structuredClone(event));
  }
}

/** Transient channel for eval-only receipts; deliberately has no persistence. */
export class RuntimeCodingVerificationEventBus {
  private readonly events = new EventEmitter();

  onReceipt(
    listener: (event: RuntimeCodingVerificationEvent) => void,
  ): () => void {
    this.events.on("receipt", listener);
    return () => this.events.off("receipt", listener);
  }

  emit(event: RuntimeCodingVerificationEvent): void {
    this.events.emit("receipt", {
      ...event,
      receipt: { ...event.receipt },
    } satisfies RuntimeCodingVerificationEvent);
  }
}
