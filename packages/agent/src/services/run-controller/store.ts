import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunSnapshot } from "./types";
import { cloneRun } from "./utils";

interface PersistedRunReceipts {
  version: 1;
  receipts: RunSnapshot[];
}

const RUN_STATUSES = new Set<RunSnapshot["status"]>([
  "thinking",
  "acting",
  "waiting",
  "complete",
  "cancelled",
  "error",
]);

function isRunSnapshot(value: unknown): value is RunSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const run = value as Partial<RunSnapshot>;
  return (
    typeof run.runId === "string" &&
    typeof run.sessionId === "string" &&
    typeof run.roomId === "string" &&
    typeof run.source === "string" &&
    typeof run.message === "string" &&
    typeof run.runDepth === "string" &&
    typeof run.configuredMaxIterations === "number" &&
    typeof run.observedActionCount === "number" &&
    typeof run.progressMode === "string" &&
    typeof run.status === "string" &&
    RUN_STATUSES.has(run.status as RunSnapshot["status"]) &&
    Array.isArray(run.localMutations) &&
    typeof run.pendingApprovals === "number" &&
    typeof run.startedAt === "string" &&
    typeof run.updatedAt === "string"
  );
}

export class RunControllerStore {
  private static readonly MAX_RECEIPTS = 120;
  private readonly activeRuns = new Map<string, RunSnapshot>();
  private readonly receipts = new Map<string, RunSnapshot>();
  private readonly roomIndex = new Map<string, string>();
  private readonly filePath?: string;

  constructor(dataDir?: string) {
    if (!dataDir) return;
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "run-receipts.json");
    this.loadReceipts();
  }

  save(run: RunSnapshot): void {
    this.activeRuns.set(run.sessionId, run);
    this.receipts.set(run.runId, cloneRun(run));
    this.trimReceipts();
    this.roomIndex.set(run.roomId, run.sessionId);
    this.persistReceipts();
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

  getByRunId(runId: string): RunSnapshot | undefined {
    const run = this.receipts.get(runId);
    return run ? cloneRun(run) : undefined;
  }

  listReceipts(limit = 30): RunSnapshot[] {
    return Array.from(this.receipts.values())
      .slice(-Math.max(1, Math.min(limit, RunControllerStore.MAX_RECEIPTS)))
      .reverse()
      .map(cloneRun);
  }

  getSessionByRoom(roomId: string): string | undefined {
    return this.roomIndex.get(roomId);
  }

  list(): RunSnapshot[] {
    return Array.from(this.activeRuns.values(), cloneRun);
  }

  apply(sessionId: string, next: RunSnapshot): void {
    this.activeRuns.set(sessionId, next);
    this.receipts.set(next.runId, cloneRun(next));
    this.trimReceipts();
    this.persistReceipts();
  }

  private trimReceipts(): void {
    while (this.receipts.size > RunControllerStore.MAX_RECEIPTS) {
      const oldest = this.receipts.keys().next().value;
      if (!oldest) return;
      this.receipts.delete(oldest);
    }
  }

  private loadReceipts(): void {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(
        readFileSync(this.filePath, "utf8"),
      ) as Partial<PersistedRunReceipts>;
      if (!Array.isArray(parsed.receipts)) return;
      const restoredAt = new Date().toISOString();
      for (const receipt of parsed.receipts
        .filter(isRunSnapshot)
        .slice(-RunControllerStore.MAX_RECEIPTS)) {
        const restored = receipt.endedAt
          ? cloneRun(receipt)
          : {
              ...cloneRun(receipt),
              status: "error" as const,
              terminalReason: "error" as const,
              statusDetail: "Interrupted by runtime restart",
              errorMessage: "Runtime restarted before this run completed.",
              updatedAt: restoredAt,
              endedAt: restoredAt,
            };
        this.receipts.set(restored.runId, restored);
      }
      this.persistReceipts();
    } catch {
      // A malformed receipt cache must never prevent the local runtime booting.
    }
  }

  private persistReceipts(): void {
    if (!this.filePath) return;
    const payload: PersistedRunReceipts = {
      version: 1,
      receipts: Array.from(this.receipts.values(), cloneRun),
    };
    writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}
