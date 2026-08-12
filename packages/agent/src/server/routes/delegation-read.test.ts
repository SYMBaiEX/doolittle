import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleDelegationReadRoutes } from "./delegation-read";

function detail(id: string, metadata: Record<string, unknown> = {}) {
  return {
    id,
    title: `Task ${id}`,
    kind: "coding",
    status: "open",
    priority: "normal",
    paused: false,
    originalRequest: `Goal ${id}`,
    sessionCount: 0,
    activeSessionCount: 0,
    latestSessionId: null,
    latestWorkdir: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    closedAt: null,
    goal: `Goal ${id}`,
    parentTaskId: null,
    acceptanceCriteria: [],
    providerPolicy: null,
    metadata,
    sessions: [],
    messages: [],
    events: [],
  };
}

function thread(id: string) {
  const {
    acceptanceCriteria: _acceptanceCriteria,
    events: _events,
    goal: _goal,
    messages: _messages,
    metadata: _metadata,
    parentTaskId: _parentTaskId,
    providerPolicy: _providerPolicy,
    sessions: _sessions,
    ...summary
  } = detail(id);
  return summary;
}

function contextWith(tasks = [detail("one"), detail("two", { group: "ops" })]) {
  const service = {
    listTasks: async () => tasks,
    getTask: async (id: string) => tasks.find((task) => task.id === id) ?? null,
    getStatus: async () => ({
      taskCount: tasks.length,
      activeTaskCount: 0,
      pausedTaskCount: 0,
      blockedTaskCount: 0,
      validatingTaskCount: 0,
      sessionCount: 0,
      activeSessionCount: 0,
      byStatus: {},
    }),
  };
  return {
    runtime: {
      getService: (name: string) =>
        name === "ORCHESTRATOR_TASK_SERVICE" ? service : null,
    },
    services: {},
  } as unknown as AppContext;
}

function contextWithService(service: Record<string, unknown>) {
  return {
    runtime: {
      getService: (name: string) =>
        name === "ORCHESTRATOR_TASK_SERVICE" ? service : null,
    },
    services: {},
  } as unknown as AppContext;
}

describe("handleDelegationReadRoutes", () => {
  it("bounds unfiltered task reads at the requested limit", async () => {
    const tasks = [detail("one"), detail("two"), detail("three")];
    const service = {
      listTasks: async ({
        limit,
      }: {
        limit?: number;
        includeArchived?: boolean;
      } = {}) => tasks.slice(0, limit),
      getTask: async (id: string) =>
        tasks.find((task) => task.id === id) ?? null,
      getStatus: async () => ({
        taskCount: tasks.length,
        activeTaskCount: 0,
        pausedTaskCount: 0,
        blockedTaskCount: 0,
        validatingTaskCount: 0,
        sessionCount: 0,
        activeSessionCount: 0,
        byStatus: {},
      }),
    };

    const response = await handleDelegationReadRoutes(
      contextWithService(service),
      new Request("http://localhost/delegation/tasks?limit=2"),
      new URL("http://localhost/delegation/tasks?limit=2"),
    );

    await expect(response?.json()).resolves.toEqual({
      tasks: [
        expect.objectContaining({ id: "one" }),
        expect.objectContaining({ id: "two" }),
      ],
    });
  });

  it("caps direct delegation reads at the bounded summary window", async () => {
    const listTasks = vi.fn(async () => [thread("one")]);
    const service = {
      listTasks,
      getTask: async () => null,
      getStatus: async () => ({
        taskCount: 1,
        activeTaskCount: 0,
        pausedTaskCount: 0,
        blockedTaskCount: 0,
        validatingTaskCount: 0,
        sessionCount: 0,
        activeSessionCount: 0,
        byStatus: {},
      }),
    };

    const response = await handleDelegationReadRoutes(
      contextWithService(service),
      new Request("http://localhost/delegation/task-summaries?limit=9000"),
      new URL("http://localhost/delegation/task-summaries?limit=9000"),
    );

    expect(response?.status).toBe(200);
    expect(listTasks).toHaveBeenCalledWith({
      includeArchived: true,
      limit: 500,
    });
  });

  it("serves filtered legacy DTOs from the official task service", async () => {
    const response = await handleDelegationReadRoutes(
      contextWith(),
      new Request("http://localhost/delegation/tasks?group=ops"),
      new URL("http://localhost/delegation/tasks?group=ops"),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      tasks: [
        expect.objectContaining({
          id: "two",
          group: "ops",
          objective: "Goal two",
          executionMode: "delegated",
        }),
      ],
    });
  });

  it("returns an explicit 503 when the official service is unavailable", async () => {
    const response = await handleDelegationReadRoutes(
      { runtime: { getService: () => null }, services: {} } as never,
      new Request("http://localhost/delegation/tasks"),
      new URL("http://localhost/delegation/tasks"),
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      available: false,
      code: "ORCHESTRATOR_TASK_SERVICE_UNAVAILABLE",
    });
  });

  it("serves task detail through the Doolittle read projection", async () => {
    const response = await handleDelegationReadRoutes(
      contextWith(),
      new Request("http://localhost/delegation/tasks/one"),
      new URL("http://localhost/delegation/tasks/one"),
    );

    await expect(response?.json()).resolves.toEqual({
      task: expect.objectContaining({ id: "one", status: "pending" }),
    });
  });

  it("serves paired local and native overviews from one projection contract", async () => {
    const response = await handleDelegationReadRoutes(
      contextWith(),
      new Request("http://localhost/delegation/overview"),
      new URL("http://localhost/delegation/overview"),
    );

    await expect(response?.json()).resolves.toMatchObject({
      overview: {
        local: {
          total: 2,
          byGroup: [
            { group: "default", count: 1 },
            { group: "ops", count: 1 },
          ],
        },
        native: {
          available: true,
          byGroup: [
            { group: "default", count: 1 },
            { group: "ops", count: 1 },
          ],
          service: "ORCHESTRATOR_TASK_SERVICE",
          total: 2,
        },
      },
    });
  });

  it("keeps overview and queue startup reads from expanding coding task details", async () => {
    const details = Array.from({ length: 500 }, (_, index) =>
      detail(`task-${index + 1}`),
    );
    const summaries = Array.from({ length: 500 }, (_, index) =>
      thread(`task-${index + 1}`),
    );
    const service = {
      listTasks: async ({
        limit,
      }: {
        limit?: number;
        includeArchived?: boolean;
      } = {}) => summaries.slice(0, limit),
      getTask: async (id: string) =>
        details.find((task) => task.id === id) ?? null,
      getStatus: async () => ({
        taskCount: details.length,
        activeTaskCount: 0,
        pausedTaskCount: 0,
        blockedTaskCount: 0,
        validatingTaskCount: 0,
        sessionCount: 0,
        activeSessionCount: 0,
        byStatus: {
          open: details.length,
          active: 0,
          waiting_on_user: 0,
          blocked: 0,
          validating: 0,
          done: 0,
          failed: 0,
          archived: 0,
          interrupted: 0,
        },
      }),
    };
    const context = contextWithService(service);
    const listSpy = vi.spyOn(service, "listTasks");
    const getTaskSpy = vi.spyOn(service, "getTask");

    const [overviewResponse, tasksResponse] = await Promise.all([
      handleDelegationReadRoutes(
        context,
        new Request("http://localhost/delegation/overview-snapshot"),
        new URL("http://localhost/delegation/overview-snapshot"),
      ),
      handleDelegationReadRoutes(
        context,
        new Request("http://localhost/delegation/task-summaries?limit=500"),
        new URL("http://localhost/delegation/task-summaries?limit=500"),
      ),
    ]);

    const overviewBody = await overviewResponse?.json();
    expect(overviewBody).toMatchObject({
      overview: {
        local: { total: 500, pending: 500 },
        native: { total: 500, available: true },
      },
    });
    expect(overviewBody.overview.local).not.toHaveProperty("byGroup");
    expect(overviewBody.overview.native).not.toHaveProperty("byLabel");
    await expect(tasksResponse?.json()).resolves.toMatchObject({
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: "task-1" }),
      ]),
    });
    expect(listSpy).toHaveBeenNthCalledWith(1, {
      includeArchived: true,
      limit: 500,
    });
    expect(listSpy).toHaveBeenNthCalledWith(2, {
      includeArchived: true,
      limit: 500,
    });
    expect(getTaskSpy).not.toHaveBeenCalled();
  });

  it("reconciles canonical sessionless research rows on the summary queue path", async () => {
    const stale = {
      ...detail("research-stale", {
        researchRun: {
          runId: "stale-run",
          status: "active",
          startedAt: "2026-08-09T00:00:00.000Z",
        },
      }),
      kind: "research",
      status: "active",
    };
    const summary = thread(stale.id);
    summary.kind = "research";
    summary.status = "active";
    const updateTask = vi.fn(
      async (_id: string, patch: Record<string, unknown>) => ({
        ...stale,
        ...patch,
      }),
    );
    const service = {
      listTasks: vi.fn(async () => [summary]),
      getTask: vi.fn(async () => stale),
      updateTask,
      getStatus: async () => ({
        taskCount: 1,
        activeTaskCount: 1,
        pausedTaskCount: 0,
        blockedTaskCount: 0,
        validatingTaskCount: 0,
        sessionCount: 0,
        activeSessionCount: 0,
        byStatus: {},
      }),
    };

    const response = await handleDelegationReadRoutes(
      contextWithService(service),
      new Request("http://localhost/delegation/task-summaries?limit=500"),
      new URL("http://localhost/delegation/task-summaries?limit=500"),
    );

    await expect(response?.json()).resolves.toEqual({
      tasks: [
        expect.objectContaining({
          id: stale.id,
          status: "cancelled",
        }),
      ],
    });
    expect(service.getTask).toHaveBeenCalledOnce();
    expect(updateTask).toHaveBeenCalledWith(
      stale.id,
      expect.objectContaining({
        status: "interrupted",
        metadata: expect.objectContaining({
          researchRun: expect.objectContaining({
            status: "interrupted",
            interruption: "reconciled-after-restart",
          }),
        }),
      }),
    );
  });
});
