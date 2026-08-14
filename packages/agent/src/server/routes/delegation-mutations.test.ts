import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleDelegationMutationRoutes } from "./delegation-mutations";

function detail(status = "active") {
  return {
    id: "task-1",
    title: "Task",
    kind: "coding",
    status,
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
  };
}

function createContext(): AppContext {
  const service = {
    addMessage: vi.fn(async () => true),
    getTask: vi.fn(async () => detail()),
    pauseTask: vi.fn(async () => ({ ...detail(), paused: true })),
    retryTaskTurn: vi.fn(async () => detail()),
    validateTask: vi.fn(async () => detail("done")),
  };
  return {
    runtime: {
      getService: (name: string) =>
        name === "ORCHESTRATOR_TASK_SERVICE" ? service : null,
    },
    services: {},
  } as unknown as AppContext;
}

describe("handleDelegationMutationRoutes", () => {
  it("maps note, retry, cancel, and completion onto official lifecycle APIs", async () => {
    const context = createContext();
    for (const action of ["note", "retry", "cancel", "complete"]) {
      const response = await handleDelegationMutationRoutes(
        context,
        new Request(`http://localhost/delegation/tasks/task-1/${action}`, {
          method: "POST",
          body: JSON.stringify({ note: action }),
        }),
        new URL(`http://localhost/delegation/tasks/task-1/${action}`),
      );
      expect(response?.status).toBe(200);
    }
  });

  it("rejects manual run/fail transitions because ACP events own status", async () => {
    const context = createContext();
    for (const action of ["run", "fail"]) {
      const response = await handleDelegationMutationRoutes(
        context,
        new Request(`http://localhost/delegation/tasks/task-1/${action}`, {
          method: "POST",
          body: "{}",
        }),
        new URL(`http://localhost/delegation/tasks/task-1/${action}`),
      );
      expect(response?.status).toBe(409);
      await expect(response?.json()).resolves.toMatchObject({
        code: "OFFICIAL_LIFECYCLE_OWNS_STATUS",
      });
    }
  });

  it("returns an explicit unavailable state", async () => {
    const response = await handleDelegationMutationRoutes(
      { runtime: { getService: () => null }, services: {} } as never,
      new Request("http://localhost/delegation/tasks/task-1/note", {
        method: "POST",
        body: "{}",
      }),
      new URL("http://localhost/delegation/tasks/task-1/note"),
    );
    expect(response?.status).toBe(503);
  });

  it("rejects malformed and invalid mutation fields before lifecycle dispatch", async () => {
    const malformed = await handleDelegationMutationRoutes(
      createContext(),
      new Request("http://localhost/delegation/tasks/task-1/note", {
        method: "POST",
        body: "{",
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks/task-1/note"),
    );
    const invalidField = await handleDelegationMutationRoutes(
      createContext(),
      new Request("http://localhost/delegation/tasks/task-1/cancel", {
        method: "POST",
        body: JSON.stringify({ cascadeChildren: "yes" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks/task-1/cancel"),
    );

    expect(malformed?.status).toBe(400);
    await expect(malformed?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(invalidField?.status).toBe(400);
    await expect(invalidField?.json()).resolves.toEqual({
      error: "cascadeChildren must be a boolean",
    });
  });
});
