import { describe, expect, it } from "vitest";
import type { RunReceipt } from "../../apps/desktop/src/renderer/chat/models";
import {
  deriveSessionAttention,
  pendingInputsBySession,
  rollupSessionRuns,
} from "../../apps/desktop/src/renderer/session-attention";
import type { DesktopRunUpdate } from "../../apps/desktop/src/shared/contracts";

function update(
  runId: string,
  sessionId: string,
  fields?: Partial<DesktopRunUpdate["run"]>,
): RunReceipt {
  return {
    latest: {
      type: "action-started",
      sessionId,
      run: {
        runId,
        sessionId,
        roomId: sessionId,
        source: "desktop",
        message: "",
        runDepth: "standard",
        configuredMaxIterations: 4,
        observedActionCount: 0,
        progressMode: "all",
        status: "acting",
        localMutations: [],
        pendingApprovals: 0,
        startedAt: "2026-11-20T00:00:00Z",
        updatedAt: "2026-11-20T00:01:00Z",
        ...fields,
      },
    },
    events: [],
  };
}

describe("rollupSessionRuns", () => {
  it("marks a session active from its active request before any receipt arrives", () => {
    const rollup = rollupSessionRuns({ "session-a": "run-a" }, {});
    expect(rollup.get("session-a")?.active).toBe(true);
  });

  it("does not mark sessions without evidence active", () => {
    const rollup = rollupSessionRuns({}, {});
    expect(rollup.get("session-a")).toBeUndefined();
  });

  it("lets a terminal receipt outrank a stale active request", () => {
    const receipt = update("run-a", "session-a", { status: "complete" });
    const rollup = rollupSessionRuns(
      { "session-a": "run-a" },
      { "run-a": receipt },
    );
    expect(rollup.get("session-a")?.active).toBeUndefined();
  });

  it("treats ended receipts as settled even with an active status", () => {
    const receipt = update("run-a", "session-a", {
      status: "waiting",
      endedAt: "2026-11-20T00:02:00Z",
    });
    const rollup = rollupSessionRuns({}, { "run-a": receipt });
    expect(rollup.get("session-a")?.active).toBeUndefined();
  });

  it("marks sessions active from active receipts without an active request", () => {
    const receipt = update("run-a", "session-a", { status: "thinking" });
    const rollup = rollupSessionRuns({}, { "run-a": receipt });
    expect(rollup.get("session-a")?.active).toBe(true);
  });

  it("accumulates pending approvals across a session's active runs", () => {
    const first = update("run-a", "session-a", { pendingApprovals: 1 });
    const second = update("run-b", "session-a", { pendingApprovals: 2 });
    const other = update("run-c", "session-b", { pendingApprovals: 3 });
    const rollup = rollupSessionRuns(
      {},
      { "run-a": first, "run-b": second, "run-c": other },
    );
    expect(rollup.get("session-a")?.pendingApprovals).toBe(3);
    expect(rollup.get("session-b")?.pendingApprovals).toBe(3);
  });

  it("ignores receipts from other sessions", () => {
    const receipt = update("run-a", "session-b", { status: "acting" });
    const rollup = rollupSessionRuns({}, { "run-a": receipt });
    expect(rollup.get("session-a")).toBeUndefined();
  });
});

describe("deriveSessionAttention", () => {
  it("stays quiet when nothing is happening", () => {
    expect(
      deriveSessionAttention({ runActivity: undefined, pendingInputs: 0 }).kind,
    ).toBe("idle");
  });

  it("reports working for an active run", () => {
    expect(
      deriveSessionAttention({
        runActivity: { active: true, pendingApprovals: 0 },
        pendingInputs: 0,
      }),
    ).toEqual({ kind: "working", label: "Working" });
  });

  it("reports needs-input for scanned pending input", () => {
    expect(
      deriveSessionAttention({
        runActivity: { active: true, pendingApprovals: 0 },
        pendingInputs: 1,
      }).kind,
    ).toBe("needs-input");
  });

  it("reports needs-input for receipt approvals even without scanned input", () => {
    expect(
      deriveSessionAttention({
        runActivity: { active: true, pendingApprovals: 2 },
        pendingInputs: 0,
      }).kind,
    ).toBe("needs-input");
  });

  it("lets needs-input win over working", () => {
    const attention = deriveSessionAttention({
      runActivity: { active: true, pendingApprovals: 1 },
      pendingInputs: 1,
    });
    expect(attention).toEqual({ kind: "needs-input", label: "Needs input" });
  });

  it("does not report needs-input for an idle session without input", () => {
    expect(
      deriveSessionAttention({
        runActivity: { active: false, pendingApprovals: 0 },
        pendingInputs: 0,
      }).kind,
    ).toBe("idle");
  });
});

describe("pendingInputsBySession", () => {
  const approval = (
    id: string,
    roomId: string,
    fields?: Record<string, unknown>,
  ) => ({
    id,
    roomId,
    status: "pending",
    ...fields,
  });

  it("counts pending approvals per room", () => {
    const counts = pendingInputsBySession([
      {
        approvals: [
          approval("ap-1", "session-a"),
          approval("ap-2", "session-a"),
          approval("ap-3", "session-b"),
        ],
      },
    ]);
    expect(counts.get("session-a")).toBe(2);
    expect(counts.get("session-b")).toBe(1);
  });

  it("counts pending input requests per room", () => {
    const counts = pendingInputsBySession([
      { requests: [approval("ir-1", "session-a")] },
    ]);
    expect(counts.get("session-a")).toBe(1);
  });

  it("ignores records that are no longer pending", () => {
    const counts = pendingInputsBySession([
      { approvals: [approval("ap-1", "session-a", { status: "approved" })] },
    ]);
    expect(counts.get("session-a")).toBeUndefined();
  });

  it("ignores approvals scoped to a different session key", () => {
    const counts = pendingInputsBySession([
      {
        approvals: [approval("ap-1", "session-a", { sessionKey: "session-b" })],
      },
    ]);
    expect(counts.get("session-a")).toBeUndefined();
  });

  it("keeps approvals whose session key matches the room", () => {
    const counts = pendingInputsBySession([
      {
        approvals: [approval("ap-1", "session-a", { sessionKey: "session-a" })],
      },
    ]);
    expect(counts.get("session-a")).toBe(1);
  });

  it("dedupes the same record across overlapping cache entries", () => {
    const shared = approval("ap-1", "session-a");
    const counts = pendingInputsBySession([
      { approvals: [shared] },
      { approvals: [shared] },
    ]);
    expect(counts.get("session-a")).toBe(1);
  });

  it("rejects malformed payloads and records", () => {
    const counts = pendingInputsBySession([
      null,
      "noise",
      { approvals: "not-a-list" },
      { approvals: [{ status: "pending", id: "", roomId: "session-a" }] },
      { approvals: [{ status: "pending", id: "ap-1" }] },
      {
        approvals: [{ status: "pending", id: "bad id!", roomId: "session-a" }],
      },
    ]);
    expect(counts.size).toBe(0);
  });
});
