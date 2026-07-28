import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunControllerStore } from "./store";
import type { RunSnapshot } from "./types";

const tempDirectories: string[] = [];

afterEach(() => {
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
  });
});
