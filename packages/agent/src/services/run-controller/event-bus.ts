import { EventEmitter } from "node:events";
import type { RunSnapshot, RunUpdateEvent, TaskRunEvent } from "./types";
import { cloneRun } from "./utils";

export class RunUpdateEventBus {
  private readonly events = new EventEmitter();

  onUpdate(listener: (event: RunUpdateEvent) => void): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  emit(type: RunUpdateEvent["type"], run: RunSnapshot): void {
    this.events.emit("update", {
      type,
      sessionId: run.sessionId,
      run: cloneRun(run),
    } satisfies RunUpdateEvent);
  }
}

export class TaskRunEventBus {
  private readonly events = new EventEmitter();

  onEvent(listener: (event: TaskRunEvent) => void): () => void {
    this.events.on("event", listener);
    return () => this.events.off("event", listener);
  }

  emit(event: TaskRunEvent): void {
    this.events.emit("event", structuredClone(event));
  }
}
