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
  const createTask = vi.fn(async (input: Record<string, unknown>) =>
    officialDetail({
      id: input.parentTaskId ? "child" : "created",
      title: input.title,
      goal: input.goal,
      originalRequest: input.originalRequest,
      parentTaskId: input.parentTaskId ?? null,
      metadata: input.metadata,
    }),
  );
  const service = { createTask };
  return {
    context: {
      runtime: {
        getService: (name: string) =>
          name === "ORCHESTRATOR_TASK_SERVICE" ? service : null,
      },
      services: {
        repository: { resolveWorktreeRoot: async (value: unknown) => value },
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
});
