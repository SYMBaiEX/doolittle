import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  readJsonFileSync,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import type { RunSnapshot, TaskRunEvent } from "./types";
import { cloneRun } from "./utils";

interface PersistedRunReceipts {
  version: 1 | 2;
  receipts: RunSnapshot[];
  events?: Record<string, TaskRunEvent[]>;
}

type PersistedRunWriter = (
  filePath: string,
  payload: PersistedRunReceipts,
) => void;

export interface RunControllerStoreOptions {
  persistenceDebounceMs?: number;
  writer?: PersistedRunWriter;
}

const RUN_STATUSES = new Set<RunSnapshot["status"]>([
  "thinking",
  "acting",
  "waiting",
  "complete",
  "cancelled",
  "error",
]);
const MAX_DELTA_EVENT_BYTES = 32 * 1024;
const MAX_JOURNAL_BYTES_PER_RUN = 512 * 1024;

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
  private static readonly MAX_EVENTS_PER_RUN = 1_500;
  private static readonly DEFAULT_PERSISTENCE_DEBOUNCE_MS = 50;
  private readonly activeRuns = new Map<string, RunSnapshot>();
  private readonly receipts = new Map<string, RunSnapshot>();
  private readonly eventJournals = new Map<string, TaskRunEvent[]>();
  private readonly roomIndex = new Map<string, string>();
  private readonly filePath?: string;
  private readonly persistenceDebounceMs: number;
  private readonly writer: PersistedRunWriter;
  private persistenceTimer?: ReturnType<typeof setTimeout>;
  private persistenceDirty = false;

  constructor(dataDir?: string, options: RunControllerStoreOptions = {}) {
    this.persistenceDebounceMs =
      options.persistenceDebounceMs ??
      RunControllerStore.DEFAULT_PERSISTENCE_DEBOUNCE_MS;
    this.writer = options.writer ?? writeJsonAtomicSync;
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
    this.persistenceDirty = true;
    this.flushPersistence();
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

  hasRunId(runId: string): boolean {
    return this.receipts.has(runId) || this.eventJournals.has(runId);
  }

  appendEvent(
    runId: string,
    type: string,
    data: unknown,
    terminal = false,
  ): { event: TaskRunEvent; appended: boolean } {
    const journal = this.eventJournals.get(runId) ?? [];
    const existingTerminal = journal.find((event) => event.terminal);
    if (existingTerminal) {
      return { event: cloneTaskEvent(existingTerminal), appended: false };
    }
    const event: TaskRunEvent = {
      id: (journal.at(-1)?.id ?? 0) + 1,
      runId,
      type,
      data: normalizeEventData(type, data, terminal),
      createdAt: new Date().toISOString(),
      terminal,
    };
    journal.push(event);
    this.trimJournal(journal);
    this.eventJournals.set(runId, journal);
    this.persistenceDirty = true;
    if (terminal) {
      this.flushPersistence();
    } else {
      this.schedulePersistence();
    }
    return { event: cloneTaskEvent(event), appended: true };
  }

  listEvents(runId: string, after = 0): TaskRunEvent[] {
    return (this.eventJournals.get(runId) ?? [])
      .filter((event) => event.id > after)
      .map(cloneTaskEvent);
  }

  getTerminalEvent(runId: string): TaskRunEvent | undefined {
    const event = this.eventJournals
      .get(runId)
      ?.find((entry) => entry.terminal);
    return event ? cloneTaskEvent(event) : undefined;
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
    this.persistenceDirty = true;
    this.flushPersistence();
  }

  private trimReceipts(): void {
    while (this.receipts.size > RunControllerStore.MAX_RECEIPTS) {
      const oldest = this.receipts.keys().next().value;
      if (!oldest) return;
      this.receipts.delete(oldest);
      this.eventJournals.delete(oldest);
    }
  }

  private trimJournal(journal: TaskRunEvent[]): void {
    while (journal.length > RunControllerStore.MAX_EVENTS_PER_RUN) {
      if (!removeOldestReplayableEvent(journal)) break;
    }
    while (estimateJournalBytes(journal) > MAX_JOURNAL_BYTES_PER_RUN) {
      if (!removeOldestReplayableEvent(journal)) break;
    }
  }

  private loadReceipts(): void {
    if (!this.filePath || !existsSync(this.filePath)) return;
    const parsed = readJsonFileSync<Partial<PersistedRunReceipts>>(
      this.filePath,
    );
    if (!Array.isArray(parsed?.receipts)) return;
    const restoredAt = new Date().toISOString();
    if (parsed.events && typeof parsed.events === "object") {
      for (const [runId, events] of Object.entries(parsed.events)) {
        if (!Array.isArray(events)) continue;
        const validEvents = events
          .filter(isTaskRunEvent)
          .slice(-RunControllerStore.MAX_EVENTS_PER_RUN)
          .map(cloneTaskEvent);
        if (validEvents.length > 0) this.eventJournals.set(runId, validEvents);
      }
    }
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
      if (!this.getTerminalEvent(restored.runId)) {
        const terminalType =
          restored.status === "complete"
            ? "response.completed"
            : restored.status === "cancelled"
              ? "response.cancelled"
              : "response.failed";
        this.appendEvent(
          restored.runId,
          terminalType,
          {
            run_id: restored.runId,
            room_id: restored.roomId,
            message: restored.errorMessage,
            ...(!receipt.endedAt ? { code: "runtime_restarted" } : {}),
          },
          true,
        );
      }
    }
    for (const [runId, events] of this.eventJournals) {
      if (events.some((event) => event.terminal)) continue;
      const created = events.find((event) => event.type === "response.created");
      this.appendEvent(
        runId,
        "response.failed",
        {
          run_id: runId,
          ...(created && typeof created.data === "object" && created.data
            ? created.data
            : {}),
          message: "Runtime restarted before this run completed.",
          code: "runtime_restarted",
        },
        true,
      );
    }
    this.persistenceDirty = true;
    this.flushPersistence();
  }

  flushPersistence(): void {
    if (this.persistenceTimer) {
      clearTimeout(this.persistenceTimer);
      this.persistenceTimer = undefined;
    }
    if (!this.filePath || !this.persistenceDirty) return;
    const payload: PersistedRunReceipts = {
      version: 2,
      receipts: Array.from(this.receipts.values(), cloneRun),
      events: Object.fromEntries(
        Array.from(this.eventJournals, ([runId, events]) => [
          runId,
          events.map(cloneTaskEvent),
        ]),
      ),
    };
    this.writer(this.filePath, payload);
    this.persistenceDirty = false;
  }

  dispose(): void {
    this.flushPersistence();
  }

  private schedulePersistence(): void {
    if (!this.filePath || this.persistenceTimer) return;
    this.persistenceTimer = setTimeout(() => {
      this.persistenceTimer = undefined;
      this.flushPersistence();
    }, this.persistenceDebounceMs);
    this.persistenceTimer.unref?.();
  }
}

function cloneEventData<T>(value: T): T {
  return structuredClone(value);
}

function normalizeEventData(
  type: string,
  data: unknown,
  terminal: boolean,
): unknown {
  if (type !== "response.output_text.delta") {
    return cloneEventData(data);
  }
  const source =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const normalized: Record<string, unknown> = {};
  if (typeof source.id === "string") normalized.id = source.id;
  if (typeof source.part_id === "string") normalized.part_id = source.part_id;
  if (Number.isSafeInteger(source.sequence)) {
    normalized.sequence = source.sequence;
  }
  if (typeof source.delta === "string") {
    normalized.delta = truncateUtf8(source.delta, MAX_DELTA_EVENT_BYTES);
  } else if (source.delta != null) {
    normalized.delta = String(source.delta);
  } else {
    normalized.delta = "";
  }
  if (
    !terminal &&
    Buffer.byteLength(JSON.stringify(normalized), "utf8") >
      MAX_DELTA_EVENT_BYTES
  ) {
    normalized.delta = truncateUtf8(
      String(normalized.delta),
      Math.max(
        0,
        MAX_DELTA_EVENT_BYTES -
          Buffer.byteLength(
            JSON.stringify({
              ...(typeof normalized.id === "string"
                ? { id: normalized.id }
                : {}),
              ...(typeof normalized.part_id === "string"
                ? { part_id: normalized.part_id }
                : {}),
              ...(Number.isSafeInteger(normalized.sequence)
                ? { sequence: normalized.sequence }
                : {}),
              delta: "",
            }),
            "utf8",
          ),
      ),
    );
  }
  return normalized;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, mid), "utf8") <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return value.slice(0, low);
}

function estimateJournalBytes(journal: TaskRunEvent[]): number {
  return Buffer.byteLength(JSON.stringify(journal), "utf8");
}

function removeOldestReplayableEvent(journal: TaskRunEvent[]): boolean {
  const removableIndex = journal.findIndex((event) => !event.terminal);
  if (removableIndex === -1) return false;
  journal.splice(removableIndex, 1);
  return true;
}

function cloneTaskEvent(event: TaskRunEvent): TaskRunEvent {
  return { ...event, data: cloneEventData(event.data) };
}

function isTaskRunEvent(value: unknown): value is TaskRunEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<TaskRunEvent>;
  return (
    Number.isSafeInteger(event.id) &&
    (event.id ?? 0) > 0 &&
    typeof event.runId === "string" &&
    typeof event.type === "string" &&
    typeof event.createdAt === "string" &&
    typeof event.terminal === "boolean"
  );
}
