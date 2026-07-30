import { describe, expect, it, vi } from "vitest";
import { DelegationService } from "./service";

function officialTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Official task",
    kind: "coding",
    status: "active",
    priority: "normal",
    paused: false,
    originalRequest: "Use the official service",
    summary: undefined,
    sessionCount: 1,
    activeSessionCount: 1,
    latestSessionId: "session-1",
    latestWorkdir: "/repo",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:01:00.000Z",
    closedAt: null,
    goal: "Use the official service",
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

describe("DelegationService read projection", () => {
  it("projects official task records without owning persistence", () => {
    const service = new DelegationService();
    service.replaceProjection([
      {
        id: "task-1",
        title: "Official task",
        objective: "Use the official service",
        status: "running",
        executionMode: "delegated",
        notes: [],
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:01:00.000Z",
      },
    ]);

    expect(service.list()).toEqual([
      expect.objectContaining({ id: "task-1", status: "running" }),
    ]);
    expect(service.overview()).toMatchObject({
      total: 1,
      running: 1,
      delegated: 1,
    });
  });

  it("exposes no product-owned lifecycle or worker APIs", () => {
    const service = new DelegationService() as unknown as Record<
      string,
      unknown
    >;

    expect(service.create).toBeUndefined();
    expect(service.markWorkerStarted).toBeUndefined();
    expect(service.getWorkerPaths).toBeUndefined();
    expect(service.superviseQueued).toBeUndefined();
  });

  it("keeps the synchronous projection current from official task events", async () => {
    let currentTask = officialTask();
    let notify: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const official = {
      listTasks: vi.fn(async () => [currentTask]),
      getTask: vi.fn(async () => currentTask),
      subscribeTaskChanges: vi.fn(
        (_id: string, listener: () => void): (() => void) => {
          notify = listener;
          return unsubscribe;
        },
      ),
    };
    const runtime = {
      getService: (name: string) =>
        name === "ORCHESTRATOR_TASK_SERVICE" ? official : null,
    };
    const service = new DelegationService();

    service.bindRuntime(runtime as never);
    await service.refresh();
    expect(service.get("task-1").status).toBe("running");
    expect(official.subscribeTaskChanges).toHaveBeenCalledTimes(1);

    currentTask = officialTask({
      status: "done",
      updatedAt: "2026-07-28T00:02:00.000Z",
    });
    notify?.();

    await vi.waitFor(() => {
      expect(service.get("task-1").status).toBe("completed");
    });
    expect(official.subscribeTaskChanges).toHaveBeenCalledTimes(1);

    service.replaceProjection([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("only notifies renderers when projected task state changes", () => {
    const service = new DelegationService();
    const listener = vi.fn();
    service.onUpdate(listener);
    const task = {
      id: "task-1",
      title: "Official task",
      objective: "Use the official service",
      status: "running" as const,
      executionMode: "delegated" as const,
      notes: [],
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:01:00.000Z",
    };

    service.replaceProjection([task]);
    service.replaceProjection([task]);
    service.upsertProjection(task);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "created", taskId: "task-1" }),
    );
  });
});
