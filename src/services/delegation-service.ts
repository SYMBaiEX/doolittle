import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DelegationTaskRecord } from "@/types";

interface DelegationStore {
  tasks: DelegationTaskRecord[];
}

export class DelegationService {
  private readonly filePath: string;
  private activeExecutions = 0;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "delegation-tasks.json");
    if (!existsSync(this.filePath)) {
      this.write({ tasks: [] });
    }
  }

  list(): DelegationTaskRecord[] {
    return this.read().tasks.slice().reverse();
  }

  create(input: {
    title: string;
    objective: string;
    executionMode?: "local" | "delegated";
  }): DelegationTaskRecord {
    const store = this.read();
    const now = new Date().toISOString();
    const task: DelegationTaskRecord = {
      id: randomUUID(),
      title: input.title,
      objective: input.objective,
      status: "pending",
      executionMode: input.executionMode ?? "local",
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    store.tasks.push(task);
    this.write(store);
    return task;
  }

  addNote(id: string, note: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.notes.push(note);
    });
  }

  markRunning(id: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.status = "running";
    });
  }

  complete(id: string, note?: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      if (note) {
        task.notes.push(note);
      }
    });
  }

  fail(id: string, note: string): DelegationTaskRecord {
    return this.update(id, (task) => {
      task.status = "failed";
      task.notes.push(note);
    });
  }

  async executeQueued(
    runner: (task: DelegationTaskRecord) => Promise<string>,
    options?: { concurrency?: number; onComplete?: (task: DelegationTaskRecord) => Promise<void> | void },
  ): Promise<DelegationTaskRecord[]> {
    const concurrency = options?.concurrency ?? 2;
    const pending = this.read().tasks.filter((task) => task.status === "pending");
    const completed: DelegationTaskRecord[] = [];

    for (const task of pending) {
      while (this.activeExecutions >= concurrency) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      this.activeExecutions += 1;
      void (async () => {
        try {
          this.markRunning(task.id);
          const result = await runner(task);
          const completedTask = this.complete(task.id, result);
          completed.push(completedTask);
          await options?.onComplete?.(completedTask);
        } catch (error) {
          this.fail(task.id, error instanceof Error ? error.message : String(error));
        } finally {
          this.activeExecutions -= 1;
        }
      })();
    }

    while (this.activeExecutions > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return completed;
  }

  private update(
    id: string,
    mutate: (task: DelegationTaskRecord) => void,
  ): DelegationTaskRecord {
    const store = this.read();
    const task = store.tasks.find((entry) => entry.id === id);
    if (!task) {
      throw new Error(`Delegation task not found: ${id}`);
    }
    mutate(task);
    task.updatedAt = new Date().toISOString();
    this.write(store);
    return task;
  }

  private read(): DelegationStore {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as DelegationStore;
  }

  private write(store: DelegationStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
