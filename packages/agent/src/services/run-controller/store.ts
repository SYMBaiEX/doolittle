import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { isRunReceiptEnvelope } from "@doolittle/contracts/run";
import { readOptionalJson } from "@doolittle/storage";
import { writeJsonAtomicSync } from "@elizaos/core";
import type { RunReceiptEnvelope, RunSnapshot, TaskRunEvent } from "./types";
import { cloneRun } from "./utils";

interface PersistedRunReceipts {
  version: 1 | 2;
  receipts: RunReceiptEnvelope[];
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

interface TaskRunJournal {
  events: TaskRunEvent[];
  bytes: number;
  lastId: number;
  ordered: boolean;
  terminalEvent?: TaskRunEvent;
}

const MAX_DELTA_EVENT_BYTES = 32 * 1024;
const MAX_JOURNAL_BYTES_PER_RUN = 512 * 1024;

export class RunControllerStore {
  // Desktop admission allows 512 queued plus active runs. Keep that fleet's
  // receipts durable while bounding terminal history and defensive excess.
  private static readonly MAX_RECEIPTS = 1_024;
  private static readonly MAX_EVENTS_PER_RUN = 1_500;
  private static readonly DEFAULT_PERSISTENCE_DEBOUNCE_MS = 50;
  private readonly activeRuns = new Map<string, RunSnapshot>();
  private readonly receipts = new Map<string, RunReceiptEnvelope>();
  private readonly eventJournals = new Map<string, TaskRunJournal>();
  private readonly roomIndex = new Map<string, string>();
  private readonly filePath?: string;
  private readonly persistenceDebounceMs: number;
  private readonly writer?: PersistedRunWriter;
  private persistenceTimer?: ReturnType<typeof setTimeout>;
  private persistenceDirty = false;

  constructor(dataDir?: string, options: RunControllerStoreOptions = {}) {
    this.persistenceDebounceMs =
      options.persistenceDebounceMs ??
      RunControllerStore.DEFAULT_PERSISTENCE_DEBOUNCE_MS;
    this.writer = options.writer;
    if (!dataDir) return;
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "run-receipts.json");
    this.loadReceipts();
  }

  save(run: RunSnapshot): void {
    if (
      !this.receipts.has(run.runId) &&
      this.receipts.size >= RunControllerStore.MAX_RECEIPTS &&
      !Array.from(this.receipts.values()).some((receipt) => receipt.endedAt)
    ) {
      throw new Error("Run receipt capacity is full.");
    }
    this.indexRoom(run);
    this.activeRuns.set(run.sessionId, run);
    this.receipts.set(run.runId, cloneRun(run));
    this.trimReceipts();
    this.persistenceDirty = true;
    this.flushPersistence();
  }

  /** Acceptance must not leave a phantom active run if its durable write fails. */
  saveAccepted(run: RunSnapshot): void {
    const activeBefore = new Map(this.activeRuns);
    const receiptsBefore = new Map(this.receipts);
    const journalsBefore = new Map(this.eventJournals);
    const roomsBefore = new Map(this.roomIndex);
    const dirtyBefore = this.persistenceDirty;
    const timerBefore = Boolean(this.persistenceTimer);
    try {
      this.save(run);
    } catch (error) {
      this.activeRuns.clear();
      for (const [key, value] of activeBefore) this.activeRuns.set(key, value);
      this.receipts.clear();
      for (const [key, value] of receiptsBefore) this.receipts.set(key, value);
      this.eventJournals.clear();
      for (const [key, value] of journalsBefore)
        this.eventJournals.set(key, value);
      this.roomIndex.clear();
      for (const [key, value] of roomsBefore) this.roomIndex.set(key, value);
      this.persistenceDirty = dirtyBefore;
      if (timerBefore && dirtyBefore) this.schedulePersistence();
      throw error;
    }
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

  getByRunId(runId: string): RunReceiptEnvelope | undefined {
    const run = this.receipts.get(runId);
    return run ? structuredClone(run) : undefined;
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
    const { event, appended } = this.recordEvent(runId, type, data, terminal);
    if (appended) {
      if (terminal) {
        this.flushPersistence();
      } else {
        this.schedulePersistence();
      }
    }
    return { event: cloneTaskEvent(event), appended };
  }

  private recordEvent(
    runId: string,
    type: string,
    data: unknown,
    terminal: boolean,
  ): { event: TaskRunEvent; appended: boolean } {
    const journal: TaskRunJournal = this.eventJournals.get(runId) ?? {
      events: [],
      bytes: 2,
      lastId: 0,
      ordered: true,
    };
    const existingTerminal = journal.terminalEvent;
    if (existingTerminal) {
      return { event: existingTerminal, appended: false };
    }
    const event: TaskRunEvent = {
      id: journal.lastId + 1,
      runId,
      type,
      data: normalizeEventData(type, data, terminal),
      createdAt: new Date().toISOString(),
      terminal,
    };
    journal.bytes += eventBytes(event) + (journal.events.length ? 1 : 0);
    journal.lastId = event.id;
    journal.events.push(event);
    if (terminal) journal.terminalEvent = event;
    this.trimJournal(journal);
    this.eventJournals.set(runId, journal);
    this.persistenceDirty = true;
    return { event, appended: true };
  }

  listEvents(runId: string, after = 0): TaskRunEvent[] {
    const journal = this.eventJournals.get(runId);
    if (!journal) return [];
    const { events, ordered } = journal;
    // Live subscribers usually read only the event that just woke them.
    if (ordered) {
      let start = events.length;
      while (start > 0 && events[start - 1].id > after) start -= 1;
      return events.slice(start).map(cloneTaskEvent);
    }
    return events.filter((event) => event.id > after).map(cloneTaskEvent);
  }

  hasJournal(runId: string): boolean {
    return this.eventJournals.has(runId);
  }

  getTerminalEvent(runId: string): TaskRunEvent | undefined {
    const event = this.eventJournals.get(runId)?.terminalEvent;
    return event ? cloneTaskEvent(event) : undefined;
  }

  listReceipts(limit = 30): RunReceiptEnvelope[] {
    return Array.from(this.receipts.values())
      .slice(-Math.max(1, Math.min(limit, RunControllerStore.MAX_RECEIPTS)))
      .reverse()
      .map((receipt) => structuredClone(receipt));
  }

  getSessionByRoom(roomId: string): string | undefined {
    return this.roomIndex.get(roomId);
  }

  list(): RunSnapshot[] {
    return Array.from(this.activeRuns.values(), cloneRun);
  }

  apply(sessionId: string, next: RunSnapshot): void {
    this.indexRoom(next);
    this.activeRuns.set(sessionId, next);
    this.receipts.set(next.runId, cloneRun(next));
    this.trimReceipts();
    this.persistenceDirty = true;
    this.flushPersistence();
  }

  private indexRoom(run: RunSnapshot): void {
    const previous = this.activeRuns.get(run.sessionId);
    if (
      previous &&
      previous.roomId !== run.roomId &&
      this.roomIndex.get(previous.roomId) === run.sessionId
    ) {
      this.roomIndex.delete(previous.roomId);
    }
    this.roomIndex.set(run.roomId, run.sessionId);
  }

  private trimReceipts(): void {
    while (this.receipts.size > RunControllerStore.MAX_RECEIPTS) {
      const oldest = Array.from(this.receipts).find(([, receipt]) =>
        Boolean(receipt.endedAt),
      )?.[0];
      if (!oldest) return;
      this.receipts.delete(oldest);
      this.eventJournals.delete(oldest);
    }
  }

  private trimJournal(journal: TaskRunJournal): void {
    const { events } = journal;
    while (
      events.length > RunControllerStore.MAX_EVENTS_PER_RUN ||
      journal.bytes > MAX_JOURNAL_BYTES_PER_RUN
    ) {
      const oldest = events.findIndex((event) => !event.terminal);
      if (oldest < 0) return;
      const [removed] = events.splice(oldest, 1);
      journal.bytes -= eventBytes(removed) + (events.length ? 1 : 0);
    }
  }

  private loadReceipts(): void {
    if (!this.filePath || !existsSync(this.filePath)) return;
    const parsed = readOptionalJson<unknown>(this.filePath);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !("receipts" in parsed) ||
      !Array.isArray(parsed.receipts)
    ) {
      return;
    }
    // The parsed document is private to this store. Publish again only when
    // recovery or normalization actually changes the durable representation.
    this.persistenceDirty =
      !("version" in parsed) ||
      parsed.version !== 2 ||
      Object.keys(parsed).length !== 3 ||
      !("events" in parsed) ||
      !parsed.events ||
      typeof parsed.events !== "object" ||
      Array.isArray(parsed.events);
    const restoredAt = new Date().toISOString();
    if (
      "events" in parsed &&
      parsed.events &&
      typeof parsed.events === "object"
    ) {
      for (const [runId, events] of Object.entries(parsed.events)) {
        if (!Array.isArray(events)) {
          this.persistenceDirty = true;
          continue;
        }
        const validEvents = events
          .filter(isTaskRunEvent)
          .slice(-RunControllerStore.MAX_EVENTS_PER_RUN);
        if (!validEvents.length) {
          this.persistenceDirty = true;
          continue;
        }
        const journal: TaskRunJournal = {
          events: validEvents,
          bytes: Buffer.byteLength(JSON.stringify(validEvents), "utf8"),
          lastId: validEvents.at(-1)?.id ?? 0,
          // Preserve the recorded order of older or externally edited journals.
          ordered: validEvents.every(
            (event, index) =>
              index === 0 || event.id > validEvents[index - 1].id,
          ),
          terminalEvent: validEvents.find((event) => event.terminal),
        };
        this.trimJournal(journal);
        if (journal.events.length !== events.length) {
          this.persistenceDirty = true;
        }
        this.eventJournals.set(runId, journal);
      }
    }
    const receipts = parsed.receipts
      .filter(isRunReceiptEnvelope)
      .slice(-RunControllerStore.MAX_RECEIPTS);
    if (receipts.length !== parsed.receipts.length)
      this.persistenceDirty = true;
    for (const receipt of receipts) {
      if (!receipt.endedAt || this.receipts.has(receipt.runId)) {
        this.persistenceDirty = true;
      }
      const restored = receipt.endedAt
        ? receipt
        : {
            ...receipt,
            status: "error" as const,
            terminalReason: "error" as const,
            statusDetail: "Interrupted by runtime restart",
            errorMessage: "Runtime restarted before this run completed.",
            updatedAt: restoredAt,
            endedAt: restoredAt,
          };
      this.receipts.set(restored.runId, restored);
      if (!this.eventJournals.get(restored.runId)?.terminalEvent) {
        const terminalType =
          restored.status === "complete"
            ? "response.completed"
            : restored.status === "cancelled"
              ? "response.cancelled"
              : "response.failed";
        this.recordEvent(
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
    for (const [runId, { events, terminalEvent }] of this.eventJournals) {
      if (terminalEvent) continue;
      const created = events.find((event) => event.type === "response.created");
      this.recordEvent(
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
    // Recovery publishes once, after every receipt and journal is restored.
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
      receipts: Array.from(this.receipts.values()),
      events: Object.fromEntries(
        Array.from(this.eventJournals, ([runId, { events }]) => [
          runId,
          events,
        ]),
      ),
    };
    if (this.writer) {
      this.writer(this.filePath, structuredClone(payload));
    } else {
      // The SDK writer serializes synchronously without retaining the snapshot.
      writeJsonAtomicSync(this.filePath, payload);
    }
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

function eventBytes(event: TaskRunEvent): number {
  return Buffer.byteLength(JSON.stringify(event), "utf8");
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
