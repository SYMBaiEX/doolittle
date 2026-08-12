import { describe, expect, it } from "vitest";
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
        local: { total: 2 },
        native: {
          available: true,
          service: "ORCHESTRATOR_TASK_SERVICE",
          total: 2,
        },
      },
    });
  });
});
