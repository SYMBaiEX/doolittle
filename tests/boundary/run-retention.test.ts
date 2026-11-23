import { expect, it } from "vitest";
import { RunControllerStore } from "../../packages/agent/src/services/run-controller/store";
import {
  createRunStartTransition,
  finishTransition,
} from "../../packages/agent/src/services/run-controller/transitions";

function run(runId: string, sessionId = runId, roomId = runId) {
  return createRunStartTransition({
    runId,
    sessionId,
    roomId,
    source: "desktop",
    message: "hello",
    runDepth: "standard",
    configuredMaxIterations: 45,
    progressMode: "verbose",
  }).run;
}

function completeRuns(store: RunControllerStore, count: number) {
  for (let index = 0; index < count; index += 1) {
    const current = run(`run-${index}`);
    store.save(current);
    store.apply(current.sessionId, finishTransition(current, "complete").run);
  }
}

it("keeps an empty run store empty", () => {
  const store = new RunControllerStore();
  expect(store.list()).toEqual([]);
  expect(store.listReceipts()).toEqual([]);
  expect(store.get("missing")).toBeUndefined();
  expect(store.getSessionByRoom("missing")).toBeUndefined();
});

it("retires completed session snapshots and room indexes with their receipts", () => {
  const store = new RunControllerStore();
  completeRuns(store, 1_100);

  expect(store.listReceipts(2_000)).toHaveLength(1_024);
  expect(store.list()).toHaveLength(1_024);
  for (let index = 0; index < 76; index += 1) {
    const id = `run-${index}`;
    expect(store.getByRunId(id)).toBeUndefined();
    expect(store.get(id)).toBeUndefined();
    expect(store.getSessionByRoom(id)).toBeUndefined();
    expect(store.getByRoom(id)).toBeUndefined();
  }
  expect(store.get("run-1099")?.status).toBe("complete");
  expect(store.getSessionByRoom("run-1099")).toBe("run-1099");
});

it.each([
  { completed: false, roomId: "old-room" },
  { completed: false, roomId: "new-room" },
  { completed: true, roomId: "old-room" },
  { completed: true, roomId: "new-room" },
])(
  "preserves a newer session run when an older receipt retires: %j",
  ({ completed, roomId }) => {
    const store = new RunControllerStore();
    const old = run("old", "session", "old-room");
    store.save(finishTransition(old, "complete").run);
    completeRuns(store, 1_023);

    const next = run("next", "session", roomId);
    const current = completed ? finishTransition(next, "complete").run : next;
    store.save(current);

    expect(store.getByRunId("old")).toBeUndefined();
    expect(store.get("session")).toEqual(current);
    expect(store.getByRunId("next")).toEqual(current);
    expect(store.getByRoom(roomId)).toEqual(current);
    expect(store.getSessionByRoom(roomId)).toBe("session");
    if (roomId !== "old-room") {
      expect(store.getSessionByRoom("old-room")).toBeUndefined();
    }
  },
);

it("does not remove a room index reassigned to a different session", () => {
  const store = new RunControllerStore();
  const old = run("old", "old-session", "shared-room");
  store.save(finishTransition(old, "complete").run);
  completeRuns(store, 1_023);

  const next = run("next", "next-session", "shared-room");
  store.save(next);

  expect(store.get("old-session")).toBeUndefined();
  expect(store.getByRunId("old")).toBeUndefined();
  expect(store.getSessionByRoom("shared-room")).toBe("next-session");
  expect(store.getByRoom("shared-room")).toEqual(next);
});

it("rejects excess active runs without evicting their ownership", () => {
  const store = new RunControllerStore();
  for (let index = 0; index < 1_024; index += 1) {
    store.save(run(`run-${index}`));
  }
  expect(() => store.save(run("excess"))).toThrow(
    "Run receipt capacity is full.",
  );
  expect(store.list()).toHaveLength(1_024);
  expect(store.get("run-0")?.endedAt).toBeUndefined();
  expect(store.getByRunId("run-0")).toBeDefined();
  expect(store.getSessionByRoom("run-0")).toBe("run-0");
  expect(store.getByRoom("run-0")?.runId).toBe("run-0");
  expect(store.get("excess")).toBeUndefined();
});
