import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { LoggerService } from "../../packages/agent/src/services/logger-service";
import { RunControllerStore } from "../../packages/agent/src/services/run-controller/store";
import { createRunStartTransition } from "../../packages/agent/src/services/run-controller/transitions";

it("contains a debounced write failure and retries pending events on a later flush", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-journal-retry-"));
  const store = new RunControllerStore(dataDir, { persistenceDebounceMs: 10 });
  const db = new DatabaseSync(join(dataDir, "state.db"));
  const logged = vi
    .spyOn(LoggerService.prototype, "error")
    .mockImplementation(() => {});
  vi.useFakeTimers();
  try {
    db.exec(`
      CREATE TRIGGER reject_events BEFORE INSERT ON task_run_events
        BEGIN SELECT RAISE(ABORT, 'Journal write failed'); END;
    `);
    const first = store.appendEvent("run", "response.created", {}).event;
    expect(() => vi.advanceTimersByTime(10)).not.toThrow();
    expect(logged).toHaveBeenCalledWith(
      "run-journal-background-flush-failed",
      expect.objectContaining({
        detail: expect.stringContaining("Journal write failed"),
      }),
    );
    expect(store.listEvents("run")).toEqual([first]);
    expect(db.prepare("SELECT payload FROM task_run_events").all()).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(logged).toHaveBeenCalledOnce();

    db.exec("DROP TRIGGER reject_events");
    const second = store.appendEvent("run", "agent.progress", {
      detail: "retry",
    }).event;
    vi.advanceTimersByTime(10);
    expect(
      db.prepare("SELECT payload FROM task_run_events ORDER BY sequence").all(),
    ).toEqual(
      [first, second].map((event) => ({ payload: JSON.stringify(event) })),
    );
    expect(logged).toHaveBeenCalledOnce();
  } finally {
    db.exec("DROP TRIGGER IF EXISTS reject_events");
    vi.useRealTimers();
    logged.mockRestore();
    db.close();
    store.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("flushes a normal debounce once without logging when no changes remain", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-journal-debounce-"));
  const store = new RunControllerStore(dataDir, { persistenceDebounceMs: 10 });
  const db = new DatabaseSync(join(dataDir, "state.db"));
  const logged = vi
    .spyOn(LoggerService.prototype, "error")
    .mockImplementation(() => {});
  vi.useFakeTimers();
  try {
    const event = store.appendEvent("run", "response.created", {}).event;
    vi.advanceTimersByTime(10);
    expect(db.prepare("SELECT payload FROM task_run_events").all()).toEqual([
      { payload: JSON.stringify(event) },
    ]);
    store.flushPersistence();
    vi.advanceTimersByTime(100);
    expect(
      db.prepare("SELECT count(*) AS count FROM task_run_events").get(),
    ).toEqual({ count: 1 });
    expect(logged).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    logged.mockRestore();
    db.close();
    store.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("keeps acceptance and terminal durability failures explicit and retryable", async () => {
  const dataDir = await mkdtemp(
    join(tmpdir(), "doolittle-journal-durability-"),
  );
  const store = new RunControllerStore(dataDir);
  const db = new DatabaseSync(join(dataDir, "state.db"));
  try {
    db.exec(`
      CREATE TRIGGER reject_receipts BEFORE INSERT ON run_receipts
        BEGIN SELECT RAISE(ABORT, 'Acceptance write failed'); END;
      CREATE TRIGGER reject_events BEFORE INSERT ON task_run_events
        BEGIN SELECT RAISE(ABORT, 'Terminal write failed'); END;
    `);
    const run = createRunStartTransition({
      runId: "run",
      sessionId: "session",
      roomId: "room",
      source: "desktop",
      message: "hello",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "verbose",
    }).run;
    expect(() => store.saveAccepted(run)).toThrow("Acceptance write failed");
    expect(store.get("session")).toBeUndefined();
    expect(store.getByRunId("run")).toBeUndefined();
    db.exec("DROP TRIGGER reject_receipts");
    store.saveAccepted(run);
    expect(() =>
      store.appendEvent("run", "response.completed", {}, true),
    ).toThrow("Terminal write failed");
    expect(store.getTerminalEvent("run")).toBeUndefined();
    db.exec("DROP TRIGGER reject_events");
    const terminal = store.appendEvent(
      "run",
      "response.completed",
      {},
      true,
    ).event;
    expect(store.getTerminalEvent("run")).toEqual(terminal);
    expect(db.prepare("SELECT terminal FROM task_run_events").all()).toEqual([
      { terminal: 1 },
    ]);
  } finally {
    db.exec(
      "DROP TRIGGER IF EXISTS reject_receipts; DROP TRIGGER IF EXISTS reject_events",
    );
    db.close();
    store.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});
