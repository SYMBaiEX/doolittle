import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunControllerStore } from "./store";
import type { RunSnapshot, TaskRunEvent } from "./types";

const tempDirectories: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const baseRun: RunSnapshot = {
  runId: "run-a",
  sessionId: "session-a",
  roomId: "room-a",
  source: "cli",
  message: "start work",
  runDepth: "standard",
  configuredMaxIterations: 45,
  observedActionCount: 0,
  progressMode: "new",
  status: "thinking",
  localMutations: [],
  pendingApprovals: 0,
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
};

describe("run-controller/store", () => {
  it("saves and retrieves runs with room index lookups", () => {
    const store = new RunControllerStore();
    store.save(baseRun);

    expect(store.getSessionByRoom("room-a")).toBe("session-a");
    expect(store.get("session-a")).toMatchObject({ runId: "run-a" });
    expect(store.getByRoom("room-a")).toMatchObject({ runId: "run-a" });
  });

  it("rolls back a failed accepted receipt write without losing trimmed receipts", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-run-accept-fail-"));
    tempDirectories.push(dataDir);
    let fail = false;
    const store = new RunControllerStore(dataDir, {
      writer: () => {
        if (fail) throw new Error("private writer failure");
      },
    });
    for (let index = 0; index < 1_024; index += 1) {
      store.save({
        ...baseRun,
        runId: `run-${index}`,
        sessionId: `session-${index}`,
        roomId: `room-${index}`,
      });
    }
    expect(() =>
      store.saveAccepted({
        ...baseRun,
        runId: "over-active-cap",
        sessionId: "over-active-session",
        roomId: "over-active-room",
        status: "waiting",
        message: "",
      }),
    ).toThrow("Run receipt capacity is full.");
    expect(store.getByRunId("over-active-cap")).toBeUndefined();
    store.apply("session-0", {
      ...baseRun,
      runId: "run-0",
      sessionId: "session-0",
      roomId: "room-0",
      status: "complete",
      terminalReason: "completed",
      endedAt: "2026-01-01T00:00:02.000Z",
    });
    store.appendEvent("run-0", "response.completed", {}, true);
    fail = true;
    expect(() =>
      store.saveAccepted({
        ...baseRun,
        runId: "accepted-overflow",
        sessionId: "accepted-session",
        roomId: "accepted-room",
        status: "waiting",
        message: "",
      }),
    ).toThrow("private writer failure");
    expect(store.getByRunId("accepted-overflow")).toBeUndefined();
    expect(store.get("accepted-session")).toBeUndefined();
    expect(store.getSessionByRoom("accepted-room")).toBeUndefined();
    expect(store.getByRunId("run-0")).toBeDefined();
    expect(store.getTerminalEvent("run-0")).toMatchObject({
      type: "response.completed",
    });
    expect(store.listReceipts(1_024)).toHaveLength(1_024);
    fail = false;
    store.saveAccepted({
      ...baseRun,
      runId: "accepted-overflow",
      sessionId: "accepted-session",
      roomId: "accepted-room",
      status: "waiting",
      message: "",
    });
    expect(store.getByRunId("accepted-overflow")?.status).toBe("waiting");
    expect(store.getByRunId("run-0")).toBeUndefined();
    expect(store.getByRunId("run-1")).toBeDefined();
  });

  it("keeps more than 120 waiting receipts queryable across restart", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-run-queue-fleet-"));
    tempDirectories.push(dataDir);
    const store = new RunControllerStore(dataDir);
    for (let index = 0; index < 130; index += 1) {
      store.saveAccepted({
        ...baseRun,
        runId: `queued-${index}`,
        sessionId: `queued-session-${index}`,
        roomId: `queued-room-${index}`,
        status: "waiting",
        message: "",
      });
    }
    expect(store.getByRunId("queued-0")?.status).toBe("waiting");
    expect(store.listReceipts(1_024)).toHaveLength(130);
    const restored = new RunControllerStore(dataDir);
    expect(restored.getByRunId("queued-0")).toMatchObject({
      status: "error",
      terminalReason: "error",
      endedAt: expect.any(String),
    });
    expect(restored.listReceipts(1_024)).toHaveLength(130);
  });

  it("returns cloned snapshots so callers cannot mutate internal state", () => {
    const store = new RunControllerStore();
    store.save(baseRun);

    const runFromGet = store.get("session-a");
    expect(runFromGet).toBeDefined();
    if (!runFromGet) return;

    runFromGet.runId = "run-mutated";
    runFromGet.roomId = "room-mutated";
    runFromGet.localMutations.push({
      action: "WRITE_FILE",
      success: true,
      recordedAt: "2026-01-01T00:00:02.000Z",
    });
    expect(store.get("session-a")?.runId).toBe("run-a");
    expect(store.get("session-a")?.roomId).toBe("room-a");
    expect(store.get("session-a")?.localMutations).toEqual([]);

    const runFromList = store.list();
    expect(runFromList).toHaveLength(1);
    const firstRun = runFromList[0];
    expect(firstRun).toBeDefined();
    if (firstRun) {
      firstRun.runId = "run-list-mutated";
    }
    expect(store.get("session-a")?.runId).toBe("run-a");
  });

  it("applies updated run snapshots by session", () => {
    const store = new RunControllerStore();
    store.save(baseRun);

    const next: RunSnapshot = {
      ...baseRun,
      status: "waiting",
      observedActionCount: 1,
      runId: "run-b",
    };

    store.apply("session-a", next);
    expect(store.get("session-a")).toMatchObject({
      status: "waiting",
      observedActionCount: 1,
      runId: "run-b",
    });
  });

  it("restores terminal receipts across service restarts", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-run-receipts-"));
    tempDirectories.push(dataDir);
    const store = new RunControllerStore(dataDir);
    store.save(baseRun);
    store.apply("session-a", {
      ...baseRun,
      status: "cancelled",
      terminalReason: "cancelled",
      endedAt: "2026-01-01T00:00:02.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
    });

    const restored = new RunControllerStore(dataDir);

    expect(restored.getByRunId("run-a")).toMatchObject({
      status: "cancelled",
      terminalReason: "cancelled",
      endedAt: "2026-01-01T00:00:02.000Z",
    });
    expect(restored.list()).toEqual([]);
  });

  it("turns an interrupted persisted run into an honest terminal receipt", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-run-receipts-"));
    tempDirectories.push(dataDir);
    const store = new RunControllerStore(dataDir);
    store.save(baseRun);

    const restored = new RunControllerStore(dataDir);

    expect(restored.getByRunId("run-a")).toMatchObject({
      status: "error",
      terminalReason: "error",
      statusDetail: "Interrupted by runtime restart",
      errorMessage: "Runtime restarted before this run completed.",
      endedAt: expect.any(String),
    });
    expect(restored.get("session-a")).toBeUndefined();
    expect(restored.getTerminalEvent("run-a")).toMatchObject({
      type: "response.failed",
      terminal: true,
      data: { code: "runtime_restarted" },
    });
  });

  it("persists a monotonic resumable event journal with one terminal event", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-run-events-"));
    tempDirectories.push(dataDir);
    const store = new RunControllerStore(dataDir);

    expect(
      store.appendEvent("run-events", "response.created", { value: 1 }).event
        .id,
    ).toBe(1);
    expect(
      store.appendEvent("run-events", "response.output_text.delta", {
        delta: "hello",
        part_id: "assistant-text",
        sequence: 1,
      }).event.id,
    ).toBe(2);
    expect(
      store.appendEvent(
        "run-events",
        "response.completed",
        { response: "hello" },
        true,
      ).event.id,
    ).toBe(3);
    expect(
      store.appendEvent("run-events", "response.cancelled", {}, true).appended,
    ).toBe(false);
    expect(
      store.appendEvent("run-events", "agent.progress", { late: true })
        .appended,
    ).toBe(false);

    const restored = new RunControllerStore(dataDir);
    expect(restored.listEvents("run-events", 1)).toMatchObject([
      {
        id: 2,
        type: "response.output_text.delta",
        terminal: false,
        data: {
          delta: "hello",
          part_id: "assistant-text",
          sequence: 1,
        },
      },
      { id: 3, type: "response.completed", terminal: true },
    ]);
    expect(
      restored.listEvents("run-events").filter((event) => event.terminal),
    ).toHaveLength(1);
  });

  it("debounces burst event writes and synchronously flushes a terminal event", () => {
    vi.useFakeTimers();
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-run-write-burst-"));
    tempDirectories.push(dataDir);
    const writes: unknown[] = [];
    const store = new RunControllerStore(dataDir, {
      persistenceDebounceMs: 50,
      writer: (_filePath, payload) => writes.push(structuredClone(payload)),
    });

    for (let index = 0; index < 100; index += 1) {
      store.appendEvent("run-burst", "response.output_text.delta", {
        delta: String(index),
      });
    }
    expect(writes).toHaveLength(0);
    vi.advanceTimersByTime(49);
    expect(writes).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(writes).toHaveLength(1);

    for (let index = 100; index < 200; index += 1) {
      store.appendEvent("run-burst", "response.output_text.delta", {
        delta: String(index),
      });
    }
    expect(writes).toHaveLength(1);
    store.appendEvent(
      "run-burst",
      "response.completed",
      { response: "complete" },
      true,
    );
    expect(writes).toHaveLength(2);
    vi.advanceTimersByTime(100);
    expect(writes).toHaveLength(2);

    const lastWrite = writes.at(-1) as {
      events: Record<string, TaskRunEvent[]>;
    };
    expect(lastWrite.events["run-burst"]?.at(-1)).toMatchObject({
      id: 201,
      type: "response.completed",
      terminal: true,
    });
  });

  it("persists streamed deltas linearly instead of journaling cumulative snapshots", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-run-linear-"));
    tempDirectories.push(dataDir);
    const writes: unknown[] = [];
    const store = new RunControllerStore(dataDir, {
      writer: (_filePath, payload) => writes.push(structuredClone(payload)),
    });

    let cumulative = "";
    for (let index = 0; index < 200; index += 1) {
      const delta = `chunk-${index.toString().padStart(3, "0")}`;
      cumulative += delta;
      store.appendEvent("run-linear", "response.output_text.delta", {
        id: "resp-linear",
        delta,
        response: cumulative,
      });
    }
    store.appendEvent(
      "run-linear",
      "response.completed",
      { response: cumulative },
      true,
    );

    const payload = writes.at(-1) as {
      events: Record<string, TaskRunEvent[]>;
    };
    const events = payload.events["run-linear"] ?? [];

    expect(events).toHaveLength(201);
    expect(
      events.every(
        (event) =>
          event.type !== "response.output_text.delta" ||
          !(
            event.data &&
            typeof event.data === "object" &&
            "response" in (event.data as Record<string, unknown>)
          ),
      ),
    ).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(events), "utf8")).toBeLessThan(
      48_000,
    );
    expect(events.at(-1)).toMatchObject({
      type: "response.completed",
      data: { response: cumulative },
      terminal: true,
    });
  });

  it("bounds oversize delta events while preserving the final terminal answer", () => {
    const store = new RunControllerStore();
    const oversizeDelta = "x".repeat(40_000);

    store.appendEvent("run-oversize", "response.output_text.delta", {
      id: "resp-oversize",
      delta: oversizeDelta,
      response: oversizeDelta.repeat(2),
    });
    store.appendEvent(
      "run-oversize",
      "response.completed",
      { response: oversizeDelta.repeat(2) },
      true,
    );

    const [deltaEvent, terminalEvent] = store.listEvents("run-oversize");
    expect(deltaEvent).toBeDefined();
    expect(terminalEvent).toBeDefined();
    expect(deltaEvent?.type).toBe("response.output_text.delta");
    expect(
      Buffer.byteLength(JSON.stringify(deltaEvent?.data ?? {}), "utf8"),
    ).toBeLessThanOrEqual(32 * 1024);
    expect(deltaEvent?.data).toMatchObject({
      id: "resp-oversize",
      delta: expect.any(String),
    });
    expect(terminalEvent).toMatchObject({
      type: "response.completed",
      data: { response: oversizeDelta.repeat(2) },
      terminal: true,
    });
  });

  it("flushes a pending nonterminal journal on explicit disposal", () => {
    vi.useFakeTimers();
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-run-dispose-"));
    tempDirectories.push(dataDir);
    const writes: unknown[] = [];
    const store = new RunControllerStore(dataDir, {
      persistenceDebounceMs: 50,
      writer: (_filePath, payload) => writes.push(structuredClone(payload)),
    });
    store.appendEvent("run-dispose", "response.created", {});

    expect(writes).toHaveLength(0);
    store.dispose();
    expect(writes).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(writes).toHaveLength(1);
  });
});
