import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { streamSse } from "../../packages/agent/src/server/responses";
import { handleChatRunEventsRoute } from "../../packages/agent/src/server/routes/conversation/chat";
import { RunControllerStore } from "../../packages/agent/src/services/run-controller/store";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service/index";

it("waits for a reader and releases a blocked producer on cancel", async () => {
  const frames: number[] = [];
  let finishProducer!: () => void;
  const producerFinished = new Promise<void>((resolve) => {
    finishProducer = resolve;
  });
  const onCancel = vi.fn();
  const response = streamSse(
    async (emit) => {
      for (const id of [1, 2, 3]) {
        await emit("progress", { id });
        frames.push(id);
      }
      finishProducer();
    },
    { onCancel },
  );

  await setImmediate();
  expect(frames).toEqual([1]);
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  await reader?.read();
  await setImmediate();
  expect(frames).toEqual([1, 2]);
  await reader?.cancel();
  await producerFinished;
  expect(onCancel).toHaveBeenCalledOnce();
});

it("replays recent events and wakes only for the requested run", async () => {
  const runController = new RunControllerService();
  const context = { services: { runController } } as AppContext;
  runController.appendTaskEvent("mine", "response.created", {});
  runController.appendTaskEvent("mine", "response.output_text.delta", {
    delta: "hello",
  });
  const response = handleChatRunEventsRoute(
    context,
    new Request("http://localhost/chat/runs/mine/events?after=1"),
    "mine",
  );
  const text = response.text();
  runController.appendTaskEvent("other", "response.output_text.delta", {
    delta: "other",
  });
  await runController.finishTaskEvent("mine", "response.completed", {
    response: "hello",
  });
  await expect(text).resolves.toBe(
    'event: response.output_text.delta\ndata: {"delta":"hello","event_id":2}\n\n' +
      'event: response.completed\ndata: {"response":"hello","event_id":3}\n\n',
  );
});

it("reports an expired cursor and delivers the terminal event after journal eviction", async () => {
  const runs = new RunControllerService();
  runs.appendTaskEvent("mine", "response.created", {});
  const progress = runs.appendTaskEvent("mine", "agent.progress", {
    detail: "x".repeat(512 * 1024),
  });
  expect(runs.getTaskEvents("mine")).toEqual([]);
  expect(runs.hasTaskJournal("mine")).toBe(true);
  const terminal = await runs.finishTaskEvent("mine", "response.completed", {});
  expect(terminal.id).toBe(progress.id + 1);
  expect(runs.getTaskEvents("mine", progress.id)).toEqual([terminal]);
  expect(runs.getTaskEvents("mine", terminal.id)).toEqual([]);
  expect(runs.appendTaskEvent("mine", "late", {})).toEqual(terminal);
  const response = handleChatRunEventsRoute(
    { services: { runController: runs } } as AppContext,
    new Request("http://localhost/chat/runs/mine/events"),
    "mine",
  );
  await expect(response.text()).resolves.toBe(
    'event: response.notice\ndata: {"code":"replay_gap","message":"Some earlier response updates expired."}\n\n' +
      'event: response.completed\ndata: {"event_id":3}\n\n',
  );
});

it("persists private event snapshots and resumes from the cursor after restart", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-journal-"));
  try {
    const runs = new RunControllerService(dataDir);
    const data = { delta: "original" };
    const delta = runs.appendTaskEvent(
      "mine",
      "response.output_text.delta",
      data,
    );
    data.delta = "changed";
    (delta.data as typeof data).delta = "also changed";
    await runs.finishTaskEvent("mine", "response.completed", { ok: true });
    runs.dispose();

    const restored = new RunControllerService(dataDir);
    const terminal = restored.getTerminalTaskEvent("mine");
    expect(restored.getTaskEvents("mine")).toEqual([
      { ...delta, data: { delta: "original" } },
      terminal,
    ]);
    expect(restored.getTaskEvents("mine", delta.id)).toEqual([terminal]);
    expect(terminal).toMatchObject({ type: "response.completed", id: 2 });
    restored.dispose();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("preserves event order when replaying an out-of-order persisted journal", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-legacy-"));
  try {
    const events = [3, 2, 1].map((id) => ({
      id,
      runId: "mine",
      type: id === 1 ? "response.completed" : "agent.progress",
      data: {},
      createdAt: "2026-11-20T00:00:00.000Z",
      terminal: id === 1,
    }));
    await writeFile(
      join(dataDir, "run-receipts.json"),
      JSON.stringify({ version: 2, receipts: [], events: { mine: events } }),
    );
    const restored = new RunControllerService(dataDir);
    expect(restored.getTaskEvents("mine", 1)).toEqual(events.slice(0, 2));
    expect(restored.getTerminalTaskEvent("mine")).toEqual(events[2]);
    restored.dispose();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("recovers all interrupted receipts and orphaned journals durably", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-recovery-"));
  try {
    const runs = new RunControllerService(dataDir);
    for (const runId of ["first", "second"]) {
      runs.startTurn({
        sessionId: runId,
        runId,
        roomId: runId,
        source: "desktop",
        message: "Continue this task",
        runDepth: "standard",
        configuredMaxIterations: 45,
        progressMode: "verbose",
      });
    }
    runs.appendTaskEvent("orphan", "response.created", { room_id: "orphan" });
    runs.dispose();

    const recovered = new RunControllerStore(dataDir);
    for (const runId of ["first", "second"]) {
      expect(recovered.getByRunId(runId)).toMatchObject({ status: "error" });
      expect(recovered.listEvents(runId)).toEqual([
        expect.objectContaining({ type: "response.failed", terminal: true }),
      ]);
    }
    const orphan = recovered.listEvents("orphan");
    expect(orphan).toEqual([
      expect.objectContaining({ type: "response.created" }),
      expect.objectContaining({
        id: 2,
        type: "response.failed",
        terminal: true,
        data: expect.objectContaining({
          room_id: "orphan",
          code: "runtime_restarted",
        }),
      }),
    ]);
    recovered.dispose();
    const reopened = new RunControllerStore(dataDir);
    expect(reopened.listEvents("orphan")).toEqual(orphan);
    expect(reopened.listEvents("first")).toHaveLength(1);
    expect(reopened.listEvents("second")).toHaveLength(1);
    reopened.dispose();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("reopens terminal receipts without rewriting the durable journal", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-terminal-"));
  try {
    const runs = new RunControllerService(dataDir);
    runs.startTurn({
      sessionId: "finished",
      runId: "finished",
      roomId: "finished",
      source: "desktop",
      message: "Finished work",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "verbose",
    });
    runs.appendTaskEvent("finished", "response.created", {});
    runs.finishTurn("finished", "complete");
    const terminal = await runs.finishTaskEvent(
      "finished",
      "response.completed",
      {},
    );
    runs.dispose();

    const db = new DatabaseSync(join(dataDir, "state.db"));
    try {
      for (const table of [
        "run_receipts",
        "task_run_journals",
        "task_run_events",
      ]) {
        for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
          db.exec(`
            CREATE TRIGGER reject_${table}_${operation} BEFORE ${operation} ON ${table}
              BEGIN SELECT RAISE(ABORT, 'Unexpected journal rewrite'); END;
          `);
        }
      }
    } finally {
      db.close();
    }
    const restored = new RunControllerStore(dataDir);
    expect(restored.getByRunId("finished")?.status).toBe("complete");
    expect(restored.getTerminalEvent("finished")).toEqual(terminal);
    restored.dispose();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("does not reimport the legacy JSON after a successful empty migration", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-sanitize-"));
  try {
    const file = join(dataDir, "run-receipts.json");
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        receipts: [null],
        events: { empty: [], invalid: [null], malformed: false },
      }),
    );
    const restored = new RunControllerStore(dataDir);
    expect(restored.listReceipts()).toEqual([]);
    expect(restored.hasJournal("invalid")).toBe(false);
    restored.dispose();

    await writeFile(file, "This stale legacy file must no longer be opened.");
    const reopened = new RunControllerStore(dataDir);
    expect(reopened.listReceipts()).toEqual([]);
    reopened.dispose();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("appends a terminal event in SQLite without reinserting earlier events", async () => {
  const dataDir = await mkdtemp(
    join(tmpdir(), "doolittle-stream-incremental-"),
  );
  const store = new RunControllerStore(dataDir);
  const db = new DatabaseSync(join(dataDir, "state.db"));
  try {
    const created = store.appendEvent("run", "response.created", {}).event;
    store.flushPersistence();
    db.exec(`
      CREATE TRIGGER preserve_events BEFORE DELETE ON task_run_events
        BEGIN SELECT RAISE(ABORT, 'Unexpected event deletion'); END;
      CREATE TRIGGER append_only_terminal BEFORE INSERT ON task_run_events
        WHEN NEW.terminal = 0
        BEGIN SELECT RAISE(ABORT, 'Unexpected event reinsertion'); END;
    `);
    const terminal = store.appendEvent(
      "run",
      "response.completed",
      {},
      true,
    ).event;
    expect(store.listEvents("run")).toEqual([created, terminal]);
    expect(
      db
        .prepare("SELECT terminal FROM task_run_events ORDER BY sequence")
        .all(),
    ).toEqual([{ terminal: 0 }, { terminal: 1 }]);
  } finally {
    db.close();
    store.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("persists journal eviction without moving the replay cursor backward", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-eviction-"));
  try {
    const store = new RunControllerStore(dataDir);
    store.appendEvent("run", "response.created", {});
    store.flushPersistence();
    const evicted = store.appendEvent("run", "agent.progress", {
      detail: "x".repeat(512 * 1024),
    }).event;
    expect(store.listEvents("run")).toEqual([]);
    store.dispose();
    const restored = new RunControllerStore(dataDir);
    expect(restored.listEvents("run")).toEqual([
      expect.objectContaining({
        id: evicted.id + 1,
        type: "response.failed",
        terminal: true,
      }),
    ]);
    restored.dispose();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("rolls back a failed migration and preserves the original JSON for retry", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-migrate-"));
  const file = join(dataDir, "run-receipts.json");
  const db = new DatabaseSync(join(dataDir, "state.db"));
  try {
    db.exec(
      "CREATE TABLE unrelated (value INTEGER); INSERT INTO unrelated VALUES (42)",
    );
    const malformedDocument = '{"version":';
    await writeFile(file, malformedDocument);
    expect(() => new RunControllerStore(dataDir)).toThrow(SyntaxError);
    expect(await readFile(file, "utf8")).toBe(malformedDocument);
    expect(db.prepare("SELECT value FROM unrelated").get()).toEqual({
      value: 42,
    });
    expect(
      db
        .prepare("SELECT name FROM sqlite_schema WHERE name = 'run_receipts'")
        .get(),
    ).toBeUndefined();

    const terminalEvent = {
      id: 12,
      runId: "legacy",
      type: "response.completed",
      terminal: true,
      data: { ok: true },
      createdAt: "2026-11-20T00:00:00.000Z",
    };
    await writeFile(
      file,
      JSON.stringify({
        version: 2,
        receipts: [],
        events: { legacy: [terminalEvent] },
      }),
    );
    const restored = new RunControllerStore(dataDir);
    expect(restored.listEvents("legacy")).toEqual([terminalEvent]);
    restored.dispose();
  } finally {
    db.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("does not publish a terminal event before its SQLite transaction succeeds", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-retry-"));
  const runs = new RunControllerService(dataDir);
  const db = new DatabaseSync(join(dataDir, "state.db"));
  try {
    const created = runs.appendTaskEvent("run", "response.created", {});
    const observed = vi.fn();
    runs.onTaskEvent("run", observed);
    db.exec(`
      CREATE TRIGGER reject_terminal BEFORE INSERT ON task_run_events
        WHEN NEW.terminal = 1
        BEGIN SELECT RAISE(ABORT, 'Terminal commit failed'); END;
    `);
    await expect(
      runs.finishTaskEvent("run", "response.completed", {}),
    ).rejects.toThrow("Terminal commit failed");
    expect(runs.getTaskEvents("run")).toEqual([created]);
    expect(runs.getTerminalTaskEvent("run")).toBeUndefined();
    expect(observed).not.toHaveBeenCalled();
    expect(db.prepare("SELECT terminal FROM task_run_events").all()).toEqual(
      [],
    );

    db.exec("DROP TRIGGER reject_terminal");
    const terminal = await runs.finishTaskEvent(
      "run",
      "response.completed",
      {},
    );
    expect(terminal.id).toBe(created.id + 1);
    expect(observed).toHaveBeenCalledExactlyOnceWith(terminal);
    expect(
      db
        .prepare("SELECT terminal FROM task_run_events ORDER BY sequence")
        .all(),
    ).toEqual([{ terminal: 0 }, { terminal: 1 }]);
  } finally {
    db.close();
    runs.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("cancels pending acceptance before model admission and preserves event order", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-accept-"));
  const runs = new RunControllerService(dataDir);
  try {
    const identity = {
      runId: "run",
      roomId: "room",
      sessionId: "session",
      source: "desktop",
    };
    expect(runs.claimTaskRun({ ...identity, responseId: "response" })).toEqual({
      accepted: true,
    });
    const controller = new AbortController();
    runs.registerAbortController(identity.runId, controller);
    const acceptance = runs.acceptQueuedRun({
      ...identity,
      runDepth: "standard",
      configuredMaxIterations: 12,
      progressMode: "new",
    });
    expect(runs.getByRunId(identity.runId)).toBeUndefined();
    const cancellation = runs.cancelRun(identity.runId);
    expect(controller.signal.aborted).toBe(true);
    await expect(acceptance).resolves.toMatchObject({ status: "waiting" });
    await expect(cancellation).resolves.toMatchObject({
      accepted: true,
      run: { status: "cancelled" },
    });
    const events = runs.getTaskEvents(identity.runId);
    expect(events.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: 1, type: "response.created" },
      { id: 2, type: "response.cancelled" },
    ]);
    runs.dispose();
    const restored = new RunControllerService(dataDir);
    try {
      expect(restored.getTaskEvents(identity.runId)).toEqual(events);
      expect(restored.getByRunId(identity.runId)?.status).toBe("cancelled");
    } finally {
      restored.dispose();
    }
  } finally {
    runs.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});
