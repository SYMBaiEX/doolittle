import { describe, expect, it } from "bun:test";
import { RunUpdateEventBus } from "./event-bus";
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
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("run-controller/event-bus", () => {
  it("emits cloned snapshots so mutations do not leak across listeners", () => {
    const bus = new RunUpdateEventBus();
    let receivedMessage = "";
    const run = { ...baseRun };

    const unsubscribe = bus.onUpdate((event) => {
      receivedMessage = event.run.runId;
      event.run.runId = "run-mutated";
    });

    bus.emit("started", run);
    unsubscribe();

    expect(receivedMessage).toBe("run-a");
    expect(run.runId).toBe("run-a");
  });

  it("stops listener after unsubscribe", () => {
    const bus = new RunUpdateEventBus();
    let count = 0;
    const unsubscribe = bus.onUpdate(() => {
      count += 1;
    });

    bus.emit("started", baseRun);
    unsubscribe();
    bus.emit("started", baseRun);

    expect(count).toBe(1);
  });
});
