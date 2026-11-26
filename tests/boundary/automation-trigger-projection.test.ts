import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { expect, it } from "vitest";
import { createTriggerRuntimeServices } from "../../packages/agent/src/runtime/native/plugin-registry/product/trigger-runtime-service";
import type { AutomationJobRecord } from "../../packages/agent/src/services/automation/types";

interface AutomationServiceShape {
  create(input: {
    name: string;
    prompt?: string;
    schedule?: string;
    trigger?:
      | { type: "manual" }
      | { type: "webhook" }
      | {
          type: "schedule";
          schedule: string;
        };
  }): Promise<AutomationJobRecord>;
  list(): Promise<AutomationJobRecord[]>;
  pause(id: string): Promise<AutomationJobRecord>;
}

function inMemoryRuntime() {
  const tasks = new Map<string, Task>();
  const runtime = {
    agentId: "00000000-0000-4000-8000-0000000000aa" as UUID,
    getSetting: () => undefined,
    getTaskWorker: () => ({}),
    createTask: async (task: Task) => {
      tasks.set(String(task.id), structuredClone(task));
      return task.id;
    },
    getTask: async (id: UUID) => tasks.get(String(id)),
    getTasks: async ({ tags = [] }: { tags?: string[] }) =>
      [...tasks.values()].filter((task) =>
        tags.every((tag) => (task.tags ?? []).includes(tag)),
      ),
    updateTask: async (id: UUID, patch: Partial<Task>) => {
      const current = tasks.get(String(id));
      if (current) tasks.set(String(id), { ...current, ...patch });
    },
    deleteTask: async (id: UUID) => {
      tasks.delete(String(id));
    },
  };
  return { runtime: runtime as unknown as IAgentRuntime, tasks };
}

function createService(runtime: IAgentRuntime): AutomationServiceShape {
  const [, TriggerRuntimeService] = createTriggerRuntimeServices(
    () => async () => "",
  );
  return new TriggerRuntimeService(
    runtime,
  ) as unknown as AutomationServiceShape;
}

function storedTriggerSentinel(tasks: Map<string, Task>, jobId: string) {
  const task = tasks.get(jobId);
  const metadata = task?.metadata as
    | { trigger?: { triggerType?: string; nextRunAtMs?: number } }
    | undefined;
  return metadata?.trigger;
}

it("projects no next run for manual and webhook automations while keeping the scheduler sentinel internal", async () => {
  const { runtime, tasks } = inMemoryRuntime();
  const service = createService(runtime);

  const manual = await service.create({
    name: "Manual report",
    prompt: "Summarize open work.",
    trigger: { type: "manual" },
  });
  const webhook = await service.create({
    name: "Webhook triage",
    prompt: "Triage the payload.",
    trigger: { type: "webhook" },
  });

  const jobs = await service.list();
  const manualProjected = jobs.find((job) => job.id === manual.id);
  const webhookProjected = jobs.find((job) => job.id === webhook.id);
  expect(manualProjected?.nextRunAt).toBeUndefined();
  expect(webhookProjected?.nextRunAt).toBeUndefined();

  // The SDK scheduler still relies on its re-arm sentinel inside the persisted
  // task; only the API projection strips it.
  const sentinel = storedTriggerSentinel(tasks, manual.id);
  expect(sentinel?.triggerType).toBe("event");
  expect(typeof sentinel?.nextRunAtMs).toBe("number");
  expect(Number(sentinel?.nextRunAtMs)).toBeGreaterThan(
    Date.now() + 300 * 24 * 60 * 60 * 1000,
  );
});

it("keeps the real next run for cron-scheduled automations", async () => {
  const { runtime } = inMemoryRuntime();
  const service = createService(runtime);

  const created = await service.create({
    name: "Weekday brief",
    prompt: "Summarize open work.",
    trigger: { type: "schedule", schedule: "0 9 * * 1-5" },
  });

  const jobs = await service.list();
  const projected = jobs.find((job) => job.id === created.id);
  const nextRunAt = Date.parse(projected?.nextRunAt ?? "");
  expect(Number.isFinite(nextRunAt)).toBe(true);
  expect(nextRunAt).toBeGreaterThan(Date.now());
  expect(nextRunAt).toBeLessThan(Date.now() + 8 * 24 * 60 * 60 * 1000);
});
