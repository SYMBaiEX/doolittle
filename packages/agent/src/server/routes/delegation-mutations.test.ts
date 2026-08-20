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
    updateTask: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
      ...detail(String(patch.status ?? "active")),
      ...patch,
    })),
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

function serviceFrom(context: AppContext) {
  return context.runtime.getService("ORCHESTRATOR_TASK_SERVICE") as unknown as {
    addMessage: ReturnType<typeof vi.fn>;
    pauseTask: ReturnType<typeof vi.fn>;
    updateTask: ReturnType<typeof vi.fn>;
    validateTask: ReturnType<typeof vi.fn>;
  };
}

describe("handleDelegationMutationRoutes", () => {
  it("maps note, retry, cancel, completion, and failure onto official lifecycle APIs", async () => {
    const context = createContext();
    for (const action of ["note", "retry", "cancel", "complete", "fail"]) {
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
    const { addMessage, pauseTask, updateTask, validateTask } =
      serviceFrom(context);
    expect(validateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ passed: true, humanOverride: true }),
    );
    expect(addMessage).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ content: "fail", senderKind: "system" }),
    );
    expect(pauseTask).toHaveBeenCalledWith("task-1");
    expect(updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        paused: true,
        summary: "fail",
      }),
    );
  });

  it("rejects manual running because ACP events own active status", async () => {
    const context = createContext();
    for (const action of ["run"]) {
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

  it("resolves a bounded task selection in bulk without failing the batch", async () => {
    const context = createContext();
    const service = serviceFrom(context);
    service.updateTask.mockRejectedValueOnce(new Error("unavailable"));
    const response = await handleDelegationMutationRoutes(
      context,
      new Request("http://localhost/delegation/tasks/bulk", {
        method: "POST",
        body: JSON.stringify({
          action: "fail",
          ids: ["task-1", "task-2", "task-2"],
        }),
      }),
      new URL("http://localhost/delegation/tasks/bulk"),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      action: "fail",
      requested: 2,
      succeeded: 1,
      failed: 1,
    });
    expect(service.updateTask).toHaveBeenCalledTimes(2);
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
