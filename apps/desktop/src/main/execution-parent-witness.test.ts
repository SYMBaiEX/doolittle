import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  matchesAutomaticAcpParent,
  sameExecutionWorkspace,
} from "./execution-parent-witness";

describe("desktop automatic ACP parent witness", () => {
  it("requires an accepted live lead run, not a UUID-shaped or cross-chat claim", () => {
    const runId = randomUUID();
    const scope = {
      sessionId: "lead-chat",
      workspacePath: "/approved/project",
      projectId: "project-1",
    };
    const parents = new Map([[runId, { ...scope, leaseId: randomUUID() }]]);
    const run = {
      botId: "lead",
      sessionId: scope.sessionId,
      projectId: scope.projectId,
    };
    const matches = (
      id: unknown,
      target = scope,
      owner: typeof run | null = run,
    ) => matchesAutomaticAcpParent(id, target, "lead", parents, () => owner);
    expect(matches(runId)).toBe(true);
    expect(matches(undefined)).toBe(false);
    expect(matches(randomUUID())).toBe(false);
    expect(matches(runId, { ...scope, sessionId: "other-chat" })).toBe(false);
    expect(matches(runId, { ...scope, workspacePath: "/other/project" })).toBe(
      false,
    );
    expect(matches(runId, scope, { ...run, botId: "other-bot" })).toBe(false);
    parents.delete(runId);
    expect(matches(runId)).toBe(false);
  });

  it("detects queued claims whose approved project changes before admission", () => {
    const original = {
      sessionId: "chat",
      workspacePath: "/approved",
      projectId: "project",
    };
    expect(sameExecutionWorkspace(original, { ...original })).toBe(true);
    expect(
      sameExecutionWorkspace(original, { ...original, projectId: "revoked" }),
    ).toBe(false);
    expect(
      sameExecutionWorkspace(original, {
        ...original,
        workspacePath: "/moved",
      }),
    ).toBe(false);
    expect(sameExecutionWorkspace(original, null)).toBe(false);
  });
});
