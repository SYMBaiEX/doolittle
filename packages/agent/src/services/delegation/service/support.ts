import { EventEmitter } from "node:events";

import type { DelegationTaskRecord } from "@/types";
import type { DelegationMutationContext } from "../service-types";
import { DelegationTaskStore } from "../storage";
import {
  buildDelegationUpdateEvent,
  type DelegationUpdateEvent,
} from "../utils";

type DelegationStoreSnapshot = ReturnType<DelegationTaskStore["read"]>;

export class DelegationServiceSupport {
  private readonly store: DelegationTaskStore;
  private readonly events = new EventEmitter();
  private activeExecutions = 0;

  constructor(baseDir: string) {
    this.store = new DelegationTaskStore(baseDir);
  }

  read(): DelegationStoreSnapshot {
    return this.store.read();
  }

  mutationContext(): DelegationMutationContext {
    return {
      read: () => this.read(),
      write: (store) => this.write(store),
      emitUpdate: (kind, task) => this.emitUpdate(kind, task),
    };
  }

  onUpdate(listener: (event: DelegationUpdateEvent) => void): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  getWorkerPaths(id: string): { inputPath: string; outputPath: string } {
    return this.store.getWorkerPaths(id);
  }

  adjustActiveExecutions(delta: number): void {
    this.activeExecutions = Math.max(0, this.activeExecutions + delta);
  }

  getActiveExecutions(): number {
    return this.activeExecutions;
  }

  private write(store: DelegationStoreSnapshot): void {
    this.store.write(store);
  }

  private emitUpdate(
    kind: "created" | "updated",
    task: DelegationTaskRecord,
  ): void {
    this.events.emit("update", buildDelegationUpdateEvent(kind, task));
  }
}
