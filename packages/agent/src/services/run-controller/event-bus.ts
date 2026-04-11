import { EventEmitter } from "node:events";
import type { RunSnapshot, RunUpdateEvent } from "./types";
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
