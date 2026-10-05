import {
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
} from "@doolittle/contracts";
import { executeTriggerTask } from "@elizaos/agent/triggers/runtime";
import type { IAgentRuntime, ServiceClass, Task, UUID } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationExecutor } from "@/services/automation/types";
import { createTriggerRuntimeServices } from "./trigger-runtime-service";

const host = vi.hoisted(() => vi.fn());
vi.mock("../../../bootstrap/worker-host-rpc", () => ({
  requestWorkerHost: host,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  host.mockReset();
});

function createHarness(
  executor: AutomationExecutor = async () => "automation complete",
) {
  const tasks = new Map<string, Task>();
  const services = new Map<string, unknown>();
  const workers = new Map<string, unknown>();
  const registerTaskWorker = vi.fn((worker: { name: string }) => {
    workers.set(worker.name, worker);
  });
  const runtime = {
    agentId: "00000000-0000-4000-8000-000000000001",
    createTask: async (task: Task) => {
      tasks.set(String(task.id), task);
      return task.id;
    },
    getTask: async (id: UUID) => tasks.get(String(id)) ?? null,
    getTasks: async () => Array.from(tasks.values()),
    getSetting: () => undefined,
    updateTask: async (id: UUID, patch: Partial<Task>) => {
      const task = tasks.get(String(id));
      if (!task) throw new Error(`Task not found: ${id}`);
      tasks.set(String(id), { ...task, ...patch });
    },
    deleteTask: async (id: UUID) => {
      tasks.delete(String(id));
    },
    getService: (name: string) => services.get(name) ?? null,
    getTaskWorker: (name: string) => workers.get(name),
    registerTaskWorker,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  } as unknown as IAgentRuntime;
  const classes = createTriggerRuntimeServices(() => executor);
  const serviceClass = (type: string) => {
    const service = classes.find(
      (entry) =>
        (entry as ServiceClass & { serviceType?: string }).serviceType === type,
    );
    if (!service) throw new Error(`Missing service class: ${type}`);
    return service;
  };
  return {
    runtime,
    serviceClass,
    services,
    tasks,
    workers,
    registerTaskWorker,
  };
}

describe("Eliza product trigger runtime adapter", () => {
  it("restores the official task worker omitted by aggregate-safe foundation init without double registration", async () => {
    const harness = createHarness();
    const cls = harness.serviceClass(DOOLITTLE_AUTOMATION_SERVICE);
    await cls.start(harness.runtime);
    await cls.start(harness.runtime);
    expect(harness.workers.has("TRIGGER_DISPATCH")).toBe(true);
    expect(harness.registerTaskWorker).toHaveBeenCalledTimes(1);
  });
  it("seeds the first scheduled SDK fire and retains its official third argument", async () => {
    const executor = vi.fn<AutomationExecutor>(async () => "done");
    const harness = createHarness(executor);
    const dispatcher = await harness
      .serviceClass(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE)
      .start(harness.runtime);
    harness.services.set(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE, dispatcher);
    const cron = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
    };
    const job = await cron.create({
      name: "Initial scheduled fire",
      schedule: "every 1h",
      prompt: "Review.",
    });
    const task = harness.tasks.get(job.id);
    if (!task) throw new Error("Missing persisted scheduled task.");
    const key = (task.metadata as { idempotencyKey: string }).idempotencyKey;
    expect(key).toMatch(new RegExp(`^${job.id}:\\d+$`));
    await executeTriggerTask(harness.runtime, task, {
      source: "scheduler",
      force: true,
    });
    expect(executor.mock.calls[0][1].idempotencyKey).toBe(key);
  });
  it("forwards the SDK third-argument fire key, not a payload supplied key", async () => {
    const executor = vi.fn<AutomationExecutor>(async () => "done");
    const harness = createHarness(executor);
    const cron = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
    };
    const job = await cron.create({
      name: "Stable fire",
      trigger: { type: "manual" },
      prompt: "Review.",
    });
    const dispatcher = (await harness
      .serviceClass(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE)
      .start(harness.runtime)) as unknown as {
      execute(
        id: string,
        payload: Record<string, unknown>,
        context?: { idempotencyKey?: string },
      ): Promise<unknown>;
    };
    await dispatcher.execute(
      job.id,
      {
        eventKind: `doolittle.manual.${job.id}`,
        idempotencyKey: "untrusted-payload-key",
      },
      { idempotencyKey: "exact-sdk-key" },
    );
    expect(executor.mock.calls[0][1]).toMatchObject({
      idempotencyKey: "exact-sdk-key",
    });
    await dispatcher.execute(job.id, {
      eventKind: `doolittle.manual.${job.id}`,
      idempotencyKey: "untrusted-payload-key",
    });
    expect(executor.mock.calls[1][1].idempotencyKey).toBeUndefined();
  });
  it("receives a stable fire key from the real official SDK trigger execution seam", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "");
    const target = "00000000-0000-4000-8000-000000000002";
    host.mockResolvedValue({
      targetBotId: target,
      approvalId: "00000000-0000-4000-8000-000000000003",
    });
    const executor = vi.fn<AutomationExecutor>(async () => "done");
    const harness = createHarness(executor);
    const dispatcher = await harness
      .serviceClass(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE)
      .start(harness.runtime);
    harness.services.set(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE, dispatcher);
    const cron = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
      runNow(id: string): Promise<unknown>;
    };
    const job = await cron.create({
      name: "Official fire key",
      targetBotId: target,
      prompt: "Review.",
      trigger: { type: "manual" },
    });
    await cron.runNow(job.id);
    expect(executor.mock.calls[0][1]).toMatchObject({
      source: "manual",
      idempotencyKey: expect.any(String),
    });
    expect(executor.mock.calls[0][1].idempotencyKey?.length).toBeGreaterThan(0);
    await cron.runNow(job.id);
    expect(executor.mock.calls[1][1].idempotencyKey).not.toBe(
      executor.mock.calls[0][1].idempotencyKey,
    );
  });
  it("persists and reuses a failed manual fire key after restart rather than replaying under a new identity", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "");
    const target = "00000000-0000-4000-8000-000000000002";
    host.mockResolvedValue({
      targetBotId: target,
      approvalId: "00000000-0000-4000-8000-000000000003",
    });
    const executor = vi.fn<AutomationExecutor>(async () => {
      throw new Error("Uncertain saved run");
    });
    const harness = createHarness(executor);
    harness.services.set(
      DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
      await harness
        .serviceClass(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE)
        .start(harness.runtime),
    );
    const cls = harness.serviceClass(DOOLITTLE_AUTOMATION_SERVICE);
    type Cron = {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
      runNow(id: string): Promise<unknown>;
    };
    const cron = (await cls.start(harness.runtime)) as unknown as Cron;
    const job = await cron.create({
      name: "Uncertain",
      targetBotId: target,
      prompt: "Review.",
      trigger: { type: "manual" },
    });
    await expect(cron.runNow(job.id)).rejects.toThrow(/Uncertain saved run/);
    const restored = (await cls.start(harness.runtime)) as unknown as Cron;
    await expect(restored.runNow(job.id)).rejects.toThrow(
      /Uncertain saved run/,
    );
    expect(executor.mock.calls[1][1].idempotencyKey).toBe(
      executor.mock.calls[0][1].idempotencyKey,
    );
  });
  it("allows a distinct explicit manual fire after host-confirmed terminal cancellation", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "");
    const target = "00000000-0000-4000-8000-000000000002";
    host.mockImplementation(async (operation) =>
      operation === "automation.status"
        ? { status: "cancelled" }
        : {
            targetBotId: target,
            approvalId: "00000000-0000-4000-8000-000000000003",
          },
    );
    const executor = vi.fn<AutomationExecutor>(async () => "done");
    executor.mockRejectedValueOnce(new Error("Stopped owned fire"));
    const harness = createHarness(executor);
    harness.services.set(
      DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
      await harness
        .serviceClass(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE)
        .start(harness.runtime),
    );
    const cron = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
      runNow(id: string): Promise<unknown>;
    };
    const job = await cron.create({
      name: "Cancelled fire",
      targetBotId: target,
      prompt: "Review.",
      trigger: { type: "manual" },
    });
    await expect(cron.runNow(job.id)).rejects.toThrow(/Stopped owned fire/);
    await cron.runNow(job.id);
    expect(executor.mock.calls[1][1].idempotencyKey).not.toBe(
      executor.mock.calls[0][1].idempotencyKey,
    );
  });
  it.each(["pause", "remove"])(
    "rejects a stale update after %s during native consent",
    async (operation) => {
      vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
      vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "");
      const harness = createHarness();
      const cron = (await harness
        .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
        .start(harness.runtime)) as unknown as {
        create(
          input: Record<string, unknown>,
        ): Promise<{ id: string; targetBotId: string }>;
        update(id: string, patch: Record<string, unknown>): Promise<unknown>;
        pause(id: string): Promise<unknown>;
        remove(id: string): Promise<unknown>;
        get(id: string): Promise<{ status: string } | undefined>;
      };
      const target = "00000000-0000-4000-8000-000000000002";
      host.mockResolvedValue({
        targetBotId: target,
        approvalId: "00000000-0000-4000-8000-000000000003",
      });
      const job = await cron.create({
        name: "Named fire",
        targetBotId: target,
        trigger: { type: "manual" },
        prompt: "Original.",
      });
      host.mockImplementationOnce(async () => {
        await cron[operation as "pause" | "remove"](job.id);
        return {
          targetBotId: target,
          approvalId: "00000000-0000-4000-8000-000000000004",
        };
      });
      await expect(cron.update(job.id, { prompt: "Edited." })).rejects.toThrow(
        /changed during approval/,
      );
      if (operation === "remove")
        expect(await cron.get(job.id)).toBeUndefined();
      else expect(await cron.get(job.id)).toMatchObject({ status: "paused" });
    },
  );
  it("keeps the canonical target immutable and denies unsupported named settings before consent", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "");
    const harness = createHarness();
    const cron = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
      update(id: string, patch: Record<string, unknown>): Promise<unknown>;
    };
    const target = "00000000-0000-4000-8000-000000000002";
    host.mockResolvedValue({
      targetBotId: target,
      approvalId: "00000000-0000-4000-8000-000000000003",
    });
    const job = await cron.create({
      name: "Named",
      targetBotId: target,
      prompt: "Review.",
      trigger: { type: "manual" },
    });
    expect(host).toHaveBeenCalledTimes(1);
    await expect(
      cron.update(job.id, { targetBotId: "default" }),
    ).rejects.toThrow(/immutable/);
    await expect(
      cron.create({
        name: "Unsupported",
        targetBotId: target,
        prompt: "Review.",
        trigger: { type: "manual" },
        delivery: "home",
      }),
    ).rejects.toThrow(/do not support/);
    expect(host).toHaveBeenCalledTimes(1);
  });
  it("persists the complete automation definition in the SDK trigger task", async () => {
    const harness = createHarness();
    const service = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
      list(): Promise<unknown[]>;
    };
    const job = await service.create({
      name: "Workspace digest",
      schedule: "every 30m",
      prompt: "Summarize the selected workspace.",
      skills: ["digest"],
    });
    expect(await service.list()).toHaveLength(1);
    const task = harness.tasks.get(job.id);
    expect(task).toBeDefined();
    if (!task) throw new Error(`Missing trigger task: ${job.id}`);
    expect(task.metadata).toMatchObject({
      trigger: {
        workflowId: job.id,
        triggerType: "interval",
        intervalMs: 30 * 60_000,
      },
    });
    expect(
      JSON.parse((task.metadata as Record<string, string>).doolittleAutomation),
    ).toMatchObject({ id: job.id, skills: ["digest"] });
  });

  it("updates lifecycle directly on the SDK task without a local job store", async () => {
    const harness = createHarness();
    const service = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
      pause(id: string): Promise<unknown>;
      remove(id: string): Promise<void>;
    };
    const job = await service.create({
      name: "One shot",
      schedule: "2h",
      prompt: "Review release.",
    });
    await service.pause(job.id);
    expect(
      (
        harness.tasks.get(job.id)?.metadata as
          | { trigger?: { enabled?: boolean } }
          | undefined
      )?.trigger?.enabled,
    ).toBe(false);
    await service.remove(job.id);
    expect(harness.tasks).toHaveLength(0);
  });

  it("owns a ready executor from the service start lifecycle", async () => {
    const executor = vi.fn(async () => "manual review complete");
    const harness = createHarness(executor);
    const cron = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
    };
    const job = await cron.create({
      name: "Manual review",
      trigger: { type: "manual" },
      prompt: "Review this project.",
    });
    const dispatcher = (await harness
      .serviceClass(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE)
      .start(harness.runtime)) as unknown as {
      execute(
        id: string,
        payload?: Record<string, unknown>,
      ): Promise<{ ok: boolean; error?: string }>;
    };
    await expect(
      dispatcher.execute(job.id, {
        eventKind: `doolittle.manual.${job.id}`,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(executor).toHaveBeenCalledOnce();
  });

  it("persists condition-aware run receipts as SDK tasks with the real source", async () => {
    const executor = vi.fn(
      async (_job: unknown, _context: { source: string }) => "release reviewed",
    );
    const harness = createHarness(executor as AutomationExecutor);
    const cron = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{ id: string }>;
      runs(
        limit: number,
      ): Promise<
        Array<{ status?: string; triggerType?: string; output: string }>
      >;
    };
    const job = await cron.create({
      name: "Release review",
      trigger: { type: "manual" },
      prompt: "Review release.",
      condition: {
        type: "payload",
        path: "release.status",
        operator: "equals",
        value: "ready",
      },
    });
    const dispatcher = (await harness
      .serviceClass(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE)
      .start(harness.runtime)) as unknown as {
      execute(
        id: string,
        payload: Record<string, unknown>,
      ): Promise<{ ok: boolean }>;
    };

    await expect(
      dispatcher.execute(job.id, {
        eventKind: `doolittle.manual.${job.id}`,
        eventPayload: { release: { status: "draft" } },
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      dispatcher.execute(job.id, {
        eventKind: `doolittle.manual.${job.id}`,
        eventPayload: { release: { status: "ready" } },
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(executor).toHaveBeenCalledOnce();
    expect(executor.mock.calls[0]?.[1]).toMatchObject({ source: "manual" });
    await expect(cron.runs(10)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "completed",
          triggerType: "manual",
          output: "release reviewed",
        }),
        expect.objectContaining({
          status: "skipped",
          triggerType: "manual",
        }),
      ]),
    );
  });

  it("rejects paused webhook triggers without weakening explicit operator runs", async () => {
    const executor = vi.fn(
      async (
        _job: Parameters<AutomationExecutor>[0],
        _context: Parameters<AutomationExecutor>[1],
      ) => "webhook automation complete",
    );
    const harness = createHarness(executor);
    const dispatcher = await harness
      .serviceClass(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE)
      .start(harness.runtime);
    harness.services.set(DOOLITTLE_WORKFLOW_DISPATCH_SERVICE, dispatcher);
    const cron = (await harness
      .serviceClass(DOOLITTLE_AUTOMATION_SERVICE)
      .start(harness.runtime)) as unknown as {
      create(input: Record<string, unknown>): Promise<{
        id: string;
        trigger: { type: "webhook"; token: string };
      }>;
      pause(id: string): Promise<unknown>;
      runNow(id: string): Promise<unknown>;
      runs(limit: number): Promise<Array<{ id: string }>>;
      triggerWebhook(
        token: string,
        payload?: Record<string, unknown>,
      ): Promise<{ id: string; status?: string }>;
    };
    harness.services.set(DOOLITTLE_AUTOMATION_SERVICE, cron);
    const job = await cron.create({
      name: "Deploy webhook",
      trigger: { type: "webhook" },
      prompt: "Review the deployment.",
    });

    const activeReceipt = await cron.triggerWebhook(job.trigger.token, {
      deployment: { status: "ready" },
    });
    expect(activeReceipt.status).toBe("completed");
    expect(executor).toHaveBeenCalledOnce();
    expect(executor.mock.calls[0]?.[1]).toMatchObject({
      source: "webhook",
      payload: { deployment: { status: "ready" } },
    });

    await cron.pause(job.id);
    const receiptsBeforePausedTrigger = await cron.runs(10);
    await expect(cron.triggerWebhook(job.trigger.token)).rejects.toThrow(
      `Cron job is paused: ${job.id}`,
    );
    await expect(cron.triggerWebhook("wrong-token")).rejects.toThrow(
      "Webhook automation not found.",
    );
    expect(executor).toHaveBeenCalledOnce();
    await expect(cron.runs(10)).resolves.toEqual(receiptsBeforePausedTrigger);

    await expect(cron.runNow(job.id)).resolves.toMatchObject({
      id: job.id,
    });
    expect(executor).toHaveBeenCalledTimes(2);
  });
});
