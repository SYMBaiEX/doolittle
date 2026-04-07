import { describe, expect, it } from "bun:test";
import { RunControllerStore } from "./store";
import type { RunSnapshot } from "./types";

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

  it("returns cloned snapshots so callers cannot mutate internal state", () => {
    const store = new RunControllerStore();
    store.save(baseRun);

    const runFromGet = store.get("session-a");
    expect(runFromGet).toBeDefined();
    if (!runFromGet) return;

    runFromGet.runId = "run-mutated";
    runFromGet.roomId = "room-mutated";
    expect(store.get("session-a")?.runId).toBe("run-a");
    expect(store.get("session-a")?.roomId).toBe("room-a");

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
});
