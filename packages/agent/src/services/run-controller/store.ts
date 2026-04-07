import type { RunSnapshot } from "./types";
import { cloneRun } from "./utils";

export class RunControllerStore {
  private readonly activeRuns = new Map<string, RunSnapshot>();
  private readonly roomIndex = new Map<string, string>();

  save(run: RunSnapshot): void {
    this.activeRuns.set(run.sessionId, run);
    this.roomIndex.set(run.roomId, run.sessionId);
  }

  getInternal(sessionId: string): RunSnapshot | undefined {
    return this.activeRuns.get(sessionId);
  }

  get(sessionId: string): RunSnapshot | undefined {
    const run = this.activeRuns.get(sessionId);
    return run ? cloneRun(run) : undefined;
  }

  getByRoom(roomId: string): RunSnapshot | undefined {
    const sessionId = this.roomIndex.get(roomId);
    if (!sessionId) {
      return undefined;
    }
    return this.get(sessionId);
  }

  getSessionByRoom(roomId: string): string | undefined {
    return this.roomIndex.get(roomId);
  }

  list(): RunSnapshot[] {
    return Array.from(this.activeRuns.values(), cloneRun);
  }

  apply(sessionId: string, next: RunSnapshot): void {
    this.activeRuns.set(sessionId, next);
  }
}
