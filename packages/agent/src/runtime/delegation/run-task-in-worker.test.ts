import { describe, expect, it, vi } from "vitest";
import { runDelegationTaskInWorker } from "./run-task-in-worker";

describe("runDelegationTaskInWorker", () => {
  it("delegates execution to the official task service without spawning a Doolittle worker", async () => {
    const spawnAgentForTask = vi.fn(async () => ({
      id: "task-1",
      title: "Migrate delegation",
      kind: "coding",
      status: "active",
      priority: "high",
      paused: false,
      originalRequest: "Use the official orchestrator",
      summary: undefined,
      sessionCount: 1,
      activeSessionCount: 1,
      latestSessionId: "session-1",
      latestWorkdir: "/repo",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:01:00.000Z",
      closedAt: null,
      goal: "Use the official orchestrator",
      parentTaskId: null,
      acceptanceCriteria: [],
      providerPolicy: { preferredFramework: "codex" },
      metadata: { workspaceRoot: "/repo" },
      sessions: [],
      messages: [],
      events: [],
    }));
    const getTask = vi.fn(async () => ({
      id: "task-1",
      metadata: { workspaceRoot: "/repo" },
      providerPolicy: { preferredFramework: "codex" },
    }));
    const runtime = {
      getService: (name: string) =>
        name === "ORCHESTRATOR_TASK_SERVICE"
          ? { getTask, spawnAgentForTask }
          : null,
    };

    const result = await runDelegationTaskInWorker(
      { runtime } as never,
      "task-1",
    );

    expect(spawnAgentForTask).toHaveBeenCalledWith("task-1", {
      workdir: "/repo",
      framework: "codex",
    });
    expect(result).toMatchObject({
      id: "task-1",
      status: "running",
      executionMode: "delegated",
    });
  });
});
