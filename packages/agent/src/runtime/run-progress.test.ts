import { describe, expect, it } from "bun:test";
import type { RunSnapshot, RunUpdateEvent } from "@/services/run-controller/types";
import {
  createResponseTextAccumulator,
  formatElapsedMs,
  formatRunEvent,
  getRunElapsedMs,
  nextResponseTextFrame,
  shouldRenderRunEvent,
} from "./run-progress";

function createRun(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId: "run-1",
    sessionId: "session-1",
    roomId: "room-1",
    source: "cli",
    message: "hello",
    runDepth: "standard",
    configuredMaxIterations: 8,
    observedActionCount: 2,
    progressMode: "new",
    status: "thinking",
    pendingApprovals: 0,
    startedAt: "2026-04-13T10:00:00.000Z",
    updatedAt: "2026-04-13T10:00:02.500Z",
    ...overrides,
  };
}

function createEvent(
  type: RunUpdateEvent["type"],
  run: Partial<RunSnapshot> = {},
): RunUpdateEvent {
  return {
    type,
    sessionId: "session-1",
    run: createRun(run),
  };
}

describe("runtime run progress helpers", () => {
  it("computes elapsed time from updated or ended timestamps", () => {
    expect(
      getRunElapsedMs(
        createRun({
          updatedAt: "2026-04-13T10:00:03.000Z",
        }),
      ),
    ).toBe(3000);
    expect(
      getRunElapsedMs(
        createRun({
          endedAt: "2026-04-13T10:00:05.000Z",
        }),
      ),
    ).toBe(5000);
    expect(getRunElapsedMs(createRun({ startedAt: "invalid" }))).toBeUndefined();
  });

  it("formats elapsed values across subsecond, second, and minute ranges", () => {
    expect(formatElapsedMs(450)).toBe("450ms");
    expect(formatElapsedMs(3200)).toBe("3.2s");
    expect(formatElapsedMs(18_400)).toBe("18s");
    expect(formatElapsedMs(125_000)).toBe("2m 5s");
    expect(formatElapsedMs(undefined)).toBeUndefined();
  });

  it("tracks incremental response frames and resets on replacement output", () => {
    const accumulator = createResponseTextAccumulator();

    expect(nextResponseTextFrame(accumulator, "hello")).toEqual({
      delta: "hello",
      full: "hello",
    });
    expect(nextResponseTextFrame(accumulator, "hello world")).toEqual({
      delta: " world",
      full: "hello world",
    });
    expect(nextResponseTextFrame(accumulator, "hello world")).toBeUndefined();
    expect(nextResponseTextFrame(accumulator, "replacement")).toEqual({
      delta: "replacement",
      full: "replacement",
    });
    expect(nextResponseTextFrame(accumulator, "")).toBeUndefined();
  });

  it("filters run events by progress mode", () => {
    expect(shouldRenderRunEvent("off", createEvent("started"))).toBe(false);
    expect(shouldRenderRunEvent("new", createEvent("started"))).toBe(true);
    expect(
      shouldRenderRunEvent(
        "new",
        createEvent("stream", { activeStream: "assistant" }),
      ),
    ).toBe(false);
    expect(
      shouldRenderRunEvent(
        "new",
        createEvent("stream", { activeStream: "tool" }),
      ),
    ).toBe(true);
    expect(shouldRenderRunEvent("all", createEvent("heartbeat"))).toBe(false);
    expect(shouldRenderRunEvent("verbose", createEvent("heartbeat"))).toBe(
      true,
    );
  });

  it("formats key operator-facing progress messages", () => {
    expect(formatRunEvent(createEvent("started"))).toContain(
      "run started · standard · cap 8",
    );
    expect(
      formatRunEvent(
        createEvent("action-started", {
          activeAction: "write regression tests for gateway readiness",
          activeStream: "tool",
          observedActionCount: 4,
        }),
      ),
    ).toContain("tool 4");
    expect(
      formatRunEvent(
        createEvent("approvals", {
          pendingApprovals: 2,
        }),
      ),
    ).toContain("pending approvals");
    expect(
      formatRunEvent(
        createEvent("error", {
          errorMessage: "remote execution failed because the sandbox is offline",
        }),
      ),
    ).toContain("run error");
    expect(formatRunEvent(createEvent("message"))).toBeUndefined();
  });
});
