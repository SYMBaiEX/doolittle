import { describe, expect, it } from "vitest";
import type { RunReceipt } from "../../apps/desktop/src/renderer/chat/models";
import {
  deriveTurnActivitySummary,
  formatTurnActivitySummary,
} from "../../apps/desktop/src/renderer/chat/turn-activity-summary";
import type { DesktopRunUpdate } from "../../apps/desktop/src/shared/contracts";

function receipt(
  fields?: Partial<DesktopRunUpdate["run"]>,
  type: DesktopRunUpdate["type"] = "completed",
): RunReceipt {
  const run = {
    runId: "run-a",
    sessionId: "session-a",
    roomId: "session-a",
    source: "desktop",
    message: "",
    runDepth: "standard",
    configuredMaxIterations: 4,
    observedActionCount: 0,
    progressMode: "all",
    status: "complete",
    localMutations: [],
    pendingApprovals: 0,
    startedAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T10:00:04.000Z",
    endedAt: "2026-11-20T10:00:04.000Z",
    terminalReason: "completed",
    ...fields,
  } as DesktopRunUpdate["run"];
  return {
    latest: { type, sessionId: run.sessionId, run },
    events: [],
  };
}

describe("deriveTurnActivitySummary", () => {
  it("derives tool, changed-file, and duration evidence from a terminal snapshot", () => {
    const summary = deriveTurnActivitySummary(
      receipt({
        observedActionCount: 7,
        startedAt: "2026-11-20T10:00:00.000Z",
        endedAt: "2026-11-20T10:00:42.000Z",
        localMutations: [
          {
            action: "PATCH_FILE",
            requestedPath: "src/a.ts",
            resolvedPath: "/repo/src/a.ts",
            success: true,
            recordedAt: "2026-11-20T10:00:20.000Z",
          },
          {
            action: "WRITE_FILE",
            requestedPath: "src/b.ts",
            success: true,
            recordedAt: "2026-11-20T10:00:21.000Z",
          },
          {
            action: "PATCH_FILE",
            resolvedPath: "/repo/src/a.ts",
            success: true,
            recordedAt: "2026-11-20T10:00:22.000Z",
          },
          {
            action: "WRITE_FILE",
            requestedPath: "src/failed.ts",
            success: false,
            recordedAt: "2026-11-20T10:00:23.000Z",
          },
        ],
      }),
    );

    expect(summary).toEqual({
      toolCallCount: 7,
      changedFileCount: 2,
      durationMs: 42_000,
    });
  });

  it("stays empty before terminal evidence exists", () => {
    expect(
      deriveTurnActivitySummary(
        receipt(
          {
            status: "acting",
            terminalReason: undefined,
            endedAt: undefined,
            observedActionCount: 3,
          },
          "action-started",
        ),
      ),
    ).toBeNull();
  });

  it("uses terminal updatedAt for legacy receipts without endedAt", () => {
    const summary = deriveTurnActivitySummary(
      receipt({
        endedAt: undefined,
        updatedAt: "2026-11-20T10:00:09.000Z",
      }),
    );

    expect(summary?.durationMs).toBe(9_000);
  });

  it("treats ended evidence as settled even when a stale status says active", () => {
    const summary = deriveTurnActivitySummary(
      receipt({ status: "acting", terminalReason: undefined }),
    );

    expect(summary?.durationMs).toBe(4_000);
  });

  it("omits malformed counts and impossible durations instead of inventing them", () => {
    const summary = deriveTurnActivitySummary(
      receipt({
        observedActionCount: 2.5,
        endedAt: "2026-11-20T09:59:59.000Z",
      }),
    );

    expect(summary).toBeNull();
  });

  it("ignores malformed mutation entries in forward-compatible receipts", () => {
    const summary = deriveTurnActivitySummary(
      receipt({
        localMutations: [
          null,
          "noise",
          { success: true },
          { success: false, requestedPath: "src/failed.ts" },
          { success: true, requestedPath: "" },
          { success: true, requestedPath: "src/kept.ts" },
        ] as unknown as DesktopRunUpdate["run"]["localMutations"],
      }),
    );

    expect(summary?.changedFileCount).toBe(1);
  });
});

describe("formatTurnActivitySummary", () => {
  it("formats a compact aggregate label", () => {
    expect(
      formatTurnActivitySummary({
        toolCallCount: 7,
        changedFileCount: 3,
        durationMs: 42_000,
      }),
    ).toBe("7 tool calls · 3 files changed · 42s");
  });

  it("uses singular units", () => {
    expect(
      formatTurnActivitySummary({
        toolCallCount: 1,
        changedFileCount: 1,
        durationMs: 1_000,
      }),
    ).toBe("1 tool call · 1 file changed · 1s");
  });

  it("omits zero segments", () => {
    expect(
      formatTurnActivitySummary({
        toolCallCount: 0,
        changedFileCount: 0,
        durationMs: 4_000,
      }),
    ).toBe("4s");
  });
});
