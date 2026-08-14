import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleDelegationCommandRoutes } from "./delegation-commands";

function officialDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "created",
    title: "Created",
    kind: "coding",
    status: "open",
    priority: "normal",
    paused: false,
    originalRequest: "Goal",
    sessionCount: 0,
    activeSessionCount: 0,
    latestSessionId: null,
    latestWorkdir: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    closedAt: null,
    goal: "Goal",
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

function createContext() {
  const tasks = new Map<string, Record<string, unknown>>();
  const createTask = vi.fn(async (input: Record<string, unknown>) => {
    const task = officialDetail({
      id: input.parentTaskId ? "child" : "created",
      title: input.title,
      goal: input.goal,
      originalRequest: input.originalRequest,
      parentTaskId: input.parentTaskId ?? null,
      metadata: input.metadata,
    });
    tasks.set(task.id, task);
    return task;
  });
  const service = {
    createTask,
    listTasks: vi.fn(async () => Array.from(tasks.values())),
    getTask: vi.fn(async (id: string) => tasks.get(id) ?? null),
    spawnAgentForTask: vi.fn(
      async (id: string, options?: { workdir?: string }) => {
        const task = tasks.get(id);
        if (!task) return null;
        const started = {
          ...task,
          status: "active",
          sessionCount: 1,
          activeSessionCount: 1,
          latestSessionId: "session-1",
          latestWorkdir: options?.workdir ?? null,
        };
        tasks.set(id, started);
        return started;
      },
    ),
  };
  return {
    context: {
      runtime: {
        getService: (name: string) =>
          name === "ORCHESTRATOR_TASK_SERVICE" ? service : null,
      },
      services: {
        repository: {
          resolveWorktreeRoot: async (value: unknown) => value,
          summary: async () => ({ root: "/repo" }),
          worktrees: async () => [
            {
              path: "/repo",
              branch: "main",
              detached: false,
              bare: false,
              prunable: false,
            },
            {
              path: "/repo/feature",
              branch: "feature/guided",
              detached: false,
              bare: false,
              prunable: false,
            },
          ],
        },
      },
    } as unknown as AppContext,
    createTask,
  };
}

describe("handleDelegationCommandRoutes", () => {
  it("creates parent and child tasks in the official store", async () => {
    const { context, createTask } = createContext();
    const create = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Parent", objective: "Goal" }),
      }),
      new URL("http://localhost/delegation/tasks"),
    );
    const child = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks/created/spawn", {
        method: "POST",
        body: JSON.stringify({ title: "Child", objective: "Child goal" }),
      }),
      new URL("http://localhost/delegation/tasks/created/spawn"),
    );

    expect(create?.status).toBe(200);
    expect(child?.status).toBe(200);
    expect(createTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ parentTaskId: "created", goal: "Child goal" }),
    );
  });

  it("reports the removed manual supervisor as delegated", async () => {
    const { context } = createContext();
    const response = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/supervise", {
        method: "POST",
        body: "{}",
      }),
      new URL("http://localhost/delegation/supervise"),
    );

    await expect(response?.json()).resolves.toEqual({
      report: expect.objectContaining({
        available: false,
        owner: "ORCHESTRATOR_TASK_SUPERVISOR",
      }),
    });
  });

  it("validates input before calling the official service", async () => {
    const { context, createTask } = createContext();
    const response = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks", {
        method: "POST",
        body: "{}",
      }),
      new URL("http://localhost/delegation/tasks"),
    );
    expect(response?.status).toBe(400);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("returns stable 400 responses for malformed delegation bodies", async () => {
    const { context, createTask } = createContext();
    const malformedCreate = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks", {
        method: "POST",
        body: "{",
      }),
      new URL("http://localhost/delegation/tasks"),
    );
    const arraySpawn = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks/created/spawn", {
        method: "POST",
        body: JSON.stringify([]),
      }),
      new URL("http://localhost/delegation/tasks/created/spawn"),
    );

    expect(malformedCreate?.status).toBe(400);
    await expect(malformedCreate?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(arraySpawn?.status).toBe(400);
    await expect(arraySpawn?.json()).resolves.toEqual({
      error: "JSON body must be an object",
    });
    expect(createTask).not.toHaveBeenCalled();
  });

  it("passes research capability and request attribution without selecting a framework", async () => {
    const { context, createTask } = createContext();
    const response = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Research sources",
          objective: "Find primary sources",
          capabilityProfile: "research",
          accountId: "account-1",
          sessionId: "session-1",
        }),
      }),
      new URL("http://localhost/delegation/tasks"),
    );

    expect(response?.status).toBe(200);
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "research",
        providerPolicy: undefined,
        metadata: expect.objectContaining({
          capabilityProfile: "research",
          accountId: "account-1",
          sessionId: "session-1",
        }),
      }),
    );
  });

  it("creates, starts, and idempotently resumes a coding task in its approved worktree", async () => {
    const { context, createTask } = createContext();
    const request = () =>
      new Request("http://localhost/delegation/tasks/start-coding", {
        method: "POST",
        body: JSON.stringify({
          title: "Fix desktop flow",
          objective: "Implement the selected task",
          kind: "coding",
          capabilityProfile: "coding",
          workspaceRoot: "/repo/feature",
          branch: "feature/guided",
          launchId: "guided-launch-123",
        }),
      });
    const first = await handleDelegationCommandRoutes(
      context,
      request(),
      new URL("http://localhost/delegation/tasks/start-coding"),
    );
    const second = await handleDelegationCommandRoutes(
      context,
      request(),
      new URL("http://localhost/delegation/tasks/start-coding"),
    );

    expect(first?.status).toBe(200);
    await expect(first?.json()).resolves.toMatchObject({
      launch: {
        task: { id: "created", workspaceRoot: "/repo/feature" },
        run: { taskId: "created", workspaceRoot: "/repo/feature" },
        review: {
          workspaceRoot: "/repo/feature",
          branch: "feature/guided",
          tab: "review",
        },
      },
    });
    expect(second?.status).toBe(200);
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it("serializes simultaneous retries for the same guided launch", async () => {
    const { context, createTask } = createContext();
    const request = () =>
      new Request("http://localhost/delegation/tasks/start-coding", {
        method: "POST",
        body: JSON.stringify({
          title: "Concurrent launch",
          objective: "Start exactly once",
          workspaceRoot: "/repo/feature",
          branch: "feature/guided",
          launchId: "guided-concurrent-123",
        }),
      });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        handleDelegationCommandRoutes(
          context,
          request(),
          new URL("http://localhost/delegation/tasks/start-coding"),
        ),
      ),
    );

    expect(responses.every((response) => response?.status === 200)).toBe(true);
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it("rejects launch id reuse with different immutable inputs", async () => {
    const { context, createTask } = createContext();
    const launch = (objective: string) =>
      handleDelegationCommandRoutes(
        context,
        new Request("http://localhost/delegation/tasks/start-coding", {
          method: "POST",
          body: JSON.stringify({
            title: "Pinned launch",
            objective,
            workspaceRoot: "/repo/feature",
            branch: "feature/guided",
            launchId: "guided-pinned-123",
          }),
        }),
        new URL("http://localhost/delegation/tasks/start-coding"),
      );

    expect((await launch("Original objective"))?.status).toBe(200);
    const mismatched = await launch("Different objective");

    expect(mismatched?.status).toBe(400);
    await expect(mismatched?.json()).resolves.toEqual({
      error:
        "launchId was already used for a different coding task or worktree.",
    });
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed, oversized, and unknown guided launch fields", async () => {
    const { context, createTask } = createContext();
    const bodies = [
      "{",
      "null",
      JSON.stringify({
        title: "Invalid",
        objective: "No extra fields",
        workspaceRoot: "/repo/feature",
        branch: "feature/guided",
        launchId: "guided-invalid-123",
        surprise: true,
      }),
      JSON.stringify({
        title: "x".repeat(201),
        objective: "Too large",
        workspaceRoot: "/repo/feature",
        branch: "feature/guided",
        launchId: "guided-invalid-456",
      }),
    ];

    for (const body of bodies) {
      const response = await handleDelegationCommandRoutes(
        context,
        new Request("http://localhost/delegation/tasks/start-coding", {
          method: "POST",
          body,
        }),
        new URL("http://localhost/delegation/tasks/start-coding"),
      );
      expect(response?.status).toBe(400);
    }
    expect(createTask).not.toHaveBeenCalled();
  });

  it("rejects the repository primary worktree", async () => {
    const { context, createTask } = createContext();
    const response = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks/start-coding", {
        method: "POST",
        body: JSON.stringify({
          title: "Unsafe primary launch",
          objective: "Do not start on main",
          workspaceRoot: "/repo",
          branch: "main",
          launchId: "guided-primary-123",
        }),
      }),
      new URL("http://localhost/delegation/tasks/start-coding"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "Guided coding cannot run in the repository's primary worktree.",
    });
    expect(createTask).not.toHaveBeenCalled();
  });

  it("rejects a branch that does not belong to the approved worktree", async () => {
    const { context, createTask } = createContext();
    const response = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks/start-coding", {
        method: "POST",
        body: JSON.stringify({
          title: "Unsafe launch",
          objective: "Do not start",
          workspaceRoot: "/repo/feature",
          branch: "main",
          launchId: "guided-launch-456",
        }),
      }),
      new URL("http://localhost/delegation/tasks/start-coding"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error:
        "The selected branch no longer matches the approved isolated worktree.",
    });
    expect(createTask).not.toHaveBeenCalled();
  });
});
