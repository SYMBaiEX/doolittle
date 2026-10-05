import { describe, expect, it } from "vitest";
import { DesktopExecutionAdmission } from "./execution-admission";

describe("DesktopExecutionAdmission", () => {
  it("caps all bots at four concurrent executions and automatic ACP at two", () => {
    const admission = new DesktopExecutionAdmission();
    const claim = (runId: string, kind: "foreground" | "automatic-acp") =>
      admission.claim({ botId: `bot-${runId}`, runId, sessionId: runId, kind });
    expect(claim("a", "automatic-acp").accepted).toBe(true);
    expect(claim("b", "automatic-acp").accepted).toBe(true);
    expect(claim("c", "automatic-acp")).toEqual({
      accepted: false,
      reason: "automatic_acp_limit",
    });
    expect(claim("c", "foreground").accepted).toBe(true);
    expect(claim("d", "foreground").accepted).toBe(true);
    expect(claim("e", "foreground")).toEqual({
      accepted: false,
      reason: "total_limit",
    });
    expect(admission.list()).toHaveLength(4);
  });

  it("requires the exact lease and releases a child's claims only on child exit", () => {
    const admission = new DesktopExecutionAdmission();
    const accepted = admission.claim({
      botId: "bot-a",
      runId: "run-a",
      sessionId: "session-a",
      kind: "foreground",
    });
    expect(accepted.accepted).toBe(true);
    if (!accepted.accepted) return;
    expect(
      admission.release({
        botId: "bot-b",
        runId: "run-a",
        leaseId: accepted.leaseId,
      }),
    ).toBe(false);
    expect(
      admission.release({
        botId: "bot-a",
        runId: "run-b",
        leaseId: accepted.leaseId,
      }),
    ).toBe(false);
    expect(
      admission.claim({
        botId: "bot-a",
        runId: "run-a",
        sessionId: "session-a",
        kind: "foreground",
      }),
    ).toEqual({
      accepted: false,
      reason: "run_exists",
    });
    admission.releaseBot("bot-b");
    expect(admission.list()).toHaveLength(1);
    admission.releaseBot("bot-a");
    expect(admission.list()).toHaveLength(0);
  });

  it("excludes overlapping mutation roots while allowing disjoint worktrees", () => {
    const admission = new DesktopExecutionAdmission();
    expect(
      admission.claim({
        botId: "lead",
        runId: "lead-run",
        sessionId: "lead-session",
        kind: "foreground",
        mutationRoot: "/repo",
      }).accepted,
    ).toBe(true);
    expect(
      admission.claim({
        botId: "child",
        runId: "child-run",
        sessionId: "child-session",
        kind: "foreground",
        mutationRoot: "/repo/packages/agent",
      }),
    ).toEqual({ accepted: false, reason: "mutation_conflict" });
    expect(
      admission.claim({
        botId: "sibling",
        runId: "sibling-run",
        sessionId: "sibling-session",
        kind: "foreground",
        mutationRoot: "/other-worktree",
      }).accepted,
    ).toBe(true);
  });
});
