import { describe, expect, it, vi } from "vitest";
import {
  createEffectiveDelegationTask,
  DelegationServiceUnavailableError,
  getEffectiveDelegationTask,
  getEffectiveDelegationTasks,
  projectOfficialTask,
  superviseEffectiveDelegationQueue,
} from ".";

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Official task",
    kind: "coding",
    status: "active",
    priority: "normal",
    paused: false,
    originalRequest: "Use official orchestration",
    summary: undefined,
    sessionCount: 1,
    activeSessionCount: 1,
    latestSessionId: "session-1",
    latestWorkdir: "/repo",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:01:00.000Z",
    closedAt: null,
    goal: "Use official orchestration",
    parentTaskId: null,
    acceptanceCriteria: [],
    providerPolicy: null,
    metadata: {},
    sessions: [],
    messages: [],
    events: [],
    ...overrides,
  };
}

function runtimeWith(service: Record<string, unknown>) {
  return {
    getService: (name: string) =>
      name === "ORCHESTRATOR_TASK_SERVICE" ? service : null,
  };
}

describe("official delegation service bridge", () => {
  it("reads and projects the official durable task service", async () => {
    const service = {
      listTasks: vi.fn(async () => [detail()]),
      getTask: vi.fn(async () => detail()),
    };

    await expect(
      getEffectiveDelegationTasks(runtimeWith(service) as never),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "task-1",
        objective: "Use official orchestration",
        status: "running",
        executionMode: "delegated",
      }),
    ]);
    await expect(
      getEffectiveDelegationTask(
        runtimeWith(service) as never,
        undefined,
        "task-1",
      ),
    ).resolves.toMatchObject({ id: "task-1", status: "running" });
  });

  it("uses the official createTask object contract", async () => {
    const createTask = vi.fn(async () => detail());
    const service = { createTask };

    await createEffectiveDelegationTask(
      runtimeWith(service) as never,
      undefined,
      {
        title: "Migrate",
        objective: "Remove the local store",
        profile: "codex",
        group: "platform",
        priority: "high",
        labels: ["orchestrator"],
        workspaceRoot: "/repo",
      },
    );

    expect(createTask).toHaveBeenCalledWith({
      title: "Migrate",
      goal: "Remove the local store",
      originalRequest: "Remove the local store",
      kind: "coding",
      priority: "high",
      providerPolicy: { preferredFramework: "codex" },
      metadata: expect.objectContaining({
        group: "platform",
        profile: "codex",
        labels: ["orchestrator"],
        workspaceRoot: "/repo",
      }),
    });
  });

  it("returns a compatibility unavailable state for manual supervision", async () => {
    await expect(
      superviseEffectiveDelegationQueue(runtimeWith({}) as never, undefined),
    ).resolves.toEqual({
      available: false,
      delegated: true,
      owner: "ORCHESTRATOR_TASK_SUPERVISOR",
      reason:
        "Manual Doolittle queue supervision was removed; the official orchestrator supervises task sessions.",
    });
  });

  it("fails explicitly instead of falling back to a second task store", async () => {
    await expect(
      getEffectiveDelegationTasks({ getService: () => null } as never),
    ).rejects.toBeInstanceOf(DelegationServiceUnavailableError);
  });

  it("maps official terminal and paused states into the legacy read model", () => {
    expect(
      projectOfficialTask(detail({ status: "done" }) as never).status,
    ).toBe("completed");
    expect(
      projectOfficialTask(detail({ status: "active", paused: true }) as never)
        .status,
    ).toBe("pending");
    expect(
      projectOfficialTask(detail({ status: "archived" }) as never).status,
    ).toBe("cancelled");
  });
});
