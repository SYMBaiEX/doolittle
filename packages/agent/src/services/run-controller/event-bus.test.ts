import { describe, expect, it } from "vitest";
import {
  RuntimeCodingVerificationEventBus,
  RunUpdateEventBus,
} from "./event-bus";
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
  localMutations: [],
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

  it("delivers the closed coding receipt only through its transient bus", () => {
    const bus = new RuntimeCodingVerificationEventBus();
    let count = 0;
    let received = "";
    const unsubscribe = bus.onReceipt((event) => {
      count += 1;
      received = event.receipt.type;
    });
    const event = {
      sessionId: "cli:session",
      runId: "run-1",
      roomId: "room-1",
      receipt: {
        type: "coding-verification" as const,
        timestamp: "2026-10-03T00:00:00.000Z",
        verifier: "sum-finite-v1" as const,
        status: "verified" as const,
        reason: "verified" as const,
        shellStarts: 1,
        shellCompletions: 1,
        verifierMatches: 1,
        success: true,
        exitCode: 0,
        timedOut: false,
        truncated: false,
        workdirMatches: true,
        actionPairMatched: true,
      },
    };

    bus.emit(event);
    unsubscribe();
    bus.emit(event);

    expect(received).toBe("coding-verification");
    expect(count).toBe(1);
  });
});
