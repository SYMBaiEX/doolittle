import { randomUUID } from "node:crypto";
import { DOOLITTLE_AUTOMATION_SERVICE } from "@doolittle/contracts";
import {
  AgentRuntime,
  basicCapabilities,
  type IAgentRuntime,
  type Service,
  ServiceType,
  startTaskScheduler,
  stopTaskScheduler,
  type Task,
  type TaskWorker,
} from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTriggerRuntimeServices } from "./plugin-registry/product/trigger-runtime-service";

const stopped: Service[] = [];
afterEach(async () => {
  for (const service of stopped.splice(0)) await service.stop();
  stopTaskScheduler();
  vi.useRealTimers();
});

async function fixture(universal: boolean) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  const tasks = new Map<string, Task>();
  const workers = new Map<string, TaskWorker>();
  let service: Service | undefined;
  const TaskService = basicCapabilities.services.find(
    (entry) => entry.serviceType === ServiceType.TASK,
  );
  if (!TaskService) throw new Error("Official SDK TaskService is missing.");
  const adapter = {
    getTasks: vi.fn(async (options?: { agentIds?: string[] }) =>
      [...tasks.values()]
        .filter(
          (row) =>
            !options?.agentIds ||
            options.agentIds.includes(String(row.agentId)),
        )
        .map((row) => structuredClone(row)),
    ),
    createTasks: async (rows: Task[]) => {
      for (const row of rows) tasks.set(String(row.id), structuredClone(row));
      return rows.map((row) => row.id);
    },
    updateTasks: async (rows: Array<{ id: string; task: Partial<Task> }>) => {
      for (const row of rows) {
        const previous = tasks.get(row.id);
        if (!previous) throw new Error("Missing task");
        tasks.set(row.id, { ...previous, ...structuredClone(row.task) });
      }
    },
    deleteTasks: async (ids: string[]) => {
      for (const id of ids) tasks.delete(id);
    },
    getTasksByIds: async (ids: string[]) =>
      ids.map((id) => tasks.get(id)).filter(Boolean),
  };
  const runtime = {
    agentId: "00000000-0000-4000-8000-000000000001",
    adapter,
    getService: (name: string) =>
      name === TaskService.serviceType ? service : null,
    registerTaskWorker: (worker: TaskWorker) =>
      workers.set(worker.name, worker),
    getTaskWorker: (name: string) => workers.get(name),
    getTasks: adapter.getTasks,
    getTask: async (id: string) => tasks.get(id) ?? null,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    createTask: AgentRuntime.prototype.createTask,
    updateTask: AgentRuntime.prototype.updateTask,
    deleteTask: AgentRuntime.prototype.deleteTask,
    deleteTasks: AgentRuntime.prototype.deleteTasks,
    _notifyCompanionTasksDirty: (
      AgentRuntime.prototype as unknown as {
        _notifyCompanionTasksDirty(): void;
      }
    )._notifyCompanionTasksDirty,
  } as unknown as IAgentRuntime;
  if (universal)
    startTaskScheduler(
      adapter as unknown as Parameters<typeof startTaskScheduler>[0],
    );
  service = await TaskService.start(runtime);
  stopped.push(service);
  const executed = vi.fn<TaskWorker["execute"]>(async () => undefined);
  runtime.registerTaskWorker({ name: "SDK_WAKE_PROOF", execute: executed });
  const add = async (
    interval: number,
    options: { repeat?: boolean; dueAt?: number; paused?: boolean } = {},
  ) => {
    const task = {
      id: randomUUID(),
      agentId: runtime.agentId,
      name: "SDK_WAKE_PROOF",
      tags: options.repeat === false ? ["queue"] : ["queue", "repeat"],
      ...(options.dueAt !== undefined ? { dueAt: options.dueAt } : {}),
      metadata: {
        updatedAt: Date.now(),
        updateInterval: interval,
        paused: options.paused,
      },
    } as Task;
    await runtime.createTask(task);
    return task as Task & { id: NonNullable<Task["id"]> };
  };
  return { runtime, adapter, tasks, service, executed, add };
}

describe.each([false, true])(
  "installed SDK next-due scheduler (universal=%s)",
  (universal) => {
    it("invalidates a restored future-task cache when the official trigger worker registers late", async () => {
      const f = await fixture(universal);
      const restored = await f.add(10_000);
      await f.runtime.updateTask(restored.id, { name: "TRIGGER_DISPATCH" });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(f.adapter.getTasks).toHaveBeenCalledTimes(1);
      const cls = createTriggerRuntimeServices(
        () => async () => "offline proof",
      ).find((entry) => entry.serviceType === DOOLITTLE_AUTOMATION_SERVICE);
      if (!cls) throw new Error("Missing trigger runtime service");
      await cls.start(f.runtime);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(f.runtime.getTaskWorker("TRIGGER_DISPATCH")).toBeDefined();
      expect(f.adapter.getTasks).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(f.adapter.getTasks).toHaveBeenCalledTimes(2);
    });
    it.each(["initial", "due"])(
      "preserves wake signals across a transient %s queue read failure",
      async (phase) => {
        const f = await fixture(universal);
        await f.add(10_000);
        if (phase === "due") await vi.advanceTimersByTimeAsync(9_000);
        f.adapter.getTasks.mockRejectedValueOnce(
          new Error("Temporary SDK persistence failure"),
        );
        await vi.advanceTimersByTimeAsync(phase === "initial" ? 12_000 : 3_000);
        expect(f.executed).toHaveBeenCalledTimes(1);
        expect(f.adapter.getTasks.mock.calls.length).toBeLessThanOrEqual(4);
      },
    );
    it("wakes future recurring tasks exactly once per cadence without idle database polling", async () => {
      const f = await fixture(universal);
      await f.add(10_000);
      await vi.advanceTimersByTimeAsync(9_000);
      expect(f.executed).not.toHaveBeenCalled();
      expect(f.adapter.getTasks).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(f.executed).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(9_000);
      expect(f.executed).toHaveBeenCalledTimes(1);
      expect(f.adapter.getTasks.mock.calls.length).toBeLessThanOrEqual(3);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(f.executed).toHaveBeenCalledTimes(2);
    });
    it("invalidates promptly for an earlier newly created task and removes deleted future wakeups", async () => {
      const f = await fixture(universal);
      const later = await f.add(60_000);
      await vi.advanceTimersByTimeAsync(2_000);
      const earlier = await f.add(5_000);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(f.executed).toHaveBeenCalledTimes(1);
      await f.runtime.deleteTasks([later.id, earlier.id]);
      await vi.advanceTimersByTimeAsync(1_000);
      const queries = f.adapter.getTasks.mock.calls.length;
      await vi.advanceTimersByTimeAsync(65_000);
      expect(f.executed).toHaveBeenCalledTimes(1);
      expect(f.adapter.getTasks).toHaveBeenCalledTimes(queries);
    });
    it("keeps paused and malformed deadlines cold rather than creating a hot query loop", async () => {
      const f = await fixture(universal);
      await f.add(10_000, { paused: true });
      await f.add(Number.NaN);
      await f.add(Number.POSITIVE_INFINITY);
      await f.add(-1);
      await f.add("1000" as unknown as number);
      await f.add(0, { repeat: false, dueAt: Number.POSITIVE_INFINITY });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(f.executed).not.toHaveBeenCalled();
      expect(f.adapter.getTasks).toHaveBeenCalledTimes(1);
    });
    it("does not execute a long non-repeat task twice when dirty notifications arrive during a tick", async () => {
      const f = await fixture(universal);
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      f.executed.mockImplementation(async () => {
        await blocked;
        return undefined;
      });
      const task = await f.add(0, { repeat: false });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(f.executed).toHaveBeenCalledTimes(1);
      await f.runtime.updateTask(task.id, {
        description: "Dirty while executing",
      });
      await vi.advanceTimersByTimeAsync(4_000);
      expect(f.executed).toHaveBeenCalledTimes(1);
      release();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(f.tasks.has(task.id)).toBe(false);
      expect(f.executed).toHaveBeenCalledTimes(1);
    });
  },
);

it("lets another SDK runtime progress while a universal-scheduler task is still executing", async () => {
  const f = await fixture(true);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.executed.mockImplementation(async () => {
    await blocked;
    return undefined;
  });
  await f.add(0, { repeat: false });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(f.executed).toHaveBeenCalledTimes(1);
  const TaskService = basicCapabilities.services.find(
    (entry) => entry.serviceType === ServiceType.TASK,
  );
  if (!TaskService) throw new Error("Missing official TaskService");
  let secondService: Service | undefined;
  const secondExecuted = vi.fn<TaskWorker["execute"]>(async () => undefined);
  const secondRuntime = {
    ...f.runtime,
    agentId: randomUUID(),
    getService: (name: string) =>
      name === ServiceType.TASK ? secondService : null,
    getTaskWorker: () => ({
      name: "SDK_SECOND_RUNTIME",
      execute: secondExecuted,
    }),
  } as IAgentRuntime;
  secondService = await TaskService.start(secondRuntime);
  stopped.push(secondService);
  await secondRuntime.createTask({
    id: randomUUID(),
    agentId: secondRuntime.agentId,
    name: "SDK_SECOND_RUNTIME",
    tags: ["queue"],
  });
  await vi.advanceTimersByTimeAsync(2_000);
  expect(secondExecuted).toHaveBeenCalledTimes(1);
  expect(f.executed).toHaveBeenCalledTimes(1);
  release();
  await vi.advanceTimersByTimeAsync(2_000);
});
