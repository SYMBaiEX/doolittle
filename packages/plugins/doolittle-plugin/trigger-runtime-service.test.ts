import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime, ServiceClass, Task, UUID } from "@elizaos/core";
import { afterEach, describe, expect, it } from "vitest";
import type { AppServices } from "../../agent/src/services";
import { CronService } from "../../agent/src/services/cron/service";
import { createTriggerRuntimeServices } from "./trigger-runtime-service";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createHarness() {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-triggers-"));
  temporaryDirectories.push(directory);
  const cron = new CronService(
    join(directory, "cron"),
    join(directory, "output"),
    60,
  );
  cron.setExecutor(async (job) => `completed ${job.name}`);

  const tasks = new Map<string, Task>();
  let sequence = 0;
  const runtime = {
    agentId: "00000000-0000-4000-8000-000000000001",
    createTask: async (task: Task) => {
      sequence += 1;
      const id =
        (task.id as string | undefined) ??
        `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      tasks.set(id, { ...task, id: id as UUID });
      return id as UUID;
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
    getService: () => null,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  } as unknown as IAgentRuntime;

  const services = { cron } as unknown as AppServices;
  const serviceClasses = createTriggerRuntimeServices(services);
  const serviceClass = (type: string) => {
    const result = serviceClasses.find(
      (entry) =>
        (entry as ServiceClass & { serviceType?: string }).serviceType === type,
    );
    if (!result) throw new Error(`Missing service class: ${type}`);
    return result;
  };

  return { cron, runtime, serviceClass, tasks };
}

describe("Eliza trigger runtime adapter", () => {
  it("reconciles stored automations into persisted SDK trigger tasks", async () => {
    const harness = createHarness();
    const job = harness.cron.create({
      name: "Workspace digest",
      schedule: "every 30m",
      prompt: "Summarize the selected workspace.",
    });

    const service = (await harness
      .serviceClass("cron")
      .start(harness.runtime)) as unknown as {
      list(): ReturnType<CronService["list"]>;
    };

    expect(service.list()).toHaveLength(1);
    expect(harness.tasks).toHaveLength(1);
    const task = Array.from(harness.tasks.values())[0];
    const trigger = (
      task?.metadata as {
        trigger?: {
          workflowId?: string;
          triggerType?: string;
          intervalMs?: number;
        };
      }
    )?.trigger;
    expect(trigger).toMatchObject({
      workflowId: job.id,
      triggerType: "interval",
      intervalMs: 30 * 60_000,
    });
  });

  it("keeps local automation metadata while SDK tasks own lifecycle", async () => {
    const harness = createHarness();
    const service = (await harness
      .serviceClass("cron")
      .start(harness.runtime)) as unknown as {
      create(input: Parameters<CronService["create"]>[0]): Promise<{
        id: string;
      }>;
      pause(id: string): Promise<unknown>;
      remove(id: string): Promise<void>;
    };

    const created = await service.create({
      name: "One shot",
      schedule: "2h",
      prompt: "Review the release.",
      skills: ["release-review"],
    });
    expect(harness.cron.get(created.id)?.skills).toEqual(["release-review"]);
    expect(harness.tasks).toHaveLength(1);

    await service.pause(created.id);
    const task = Array.from(harness.tasks.values())[0];
    expect(
      (
        task?.metadata as {
          trigger?: {
            enabled?: boolean;
            triggerType?: string;
            maxRuns?: number;
          };
        }
      ).trigger,
    ).toMatchObject({
      enabled: false,
      triggerType: "once",
      maxRuns: 1,
    });

    await service.remove(created.id);
    expect(harness.cron.get(created.id)).toBeUndefined();
    expect(harness.tasks).toHaveLength(0);
  });

  it("dispatches workflow triggers through the existing receipt adapter", async () => {
    const harness = createHarness();
    const job = harness.cron.create({
      name: "Manual review",
      trigger: { type: "manual" },
      action: { type: "prompt", prompt: "Review this project." },
    });
    const dispatcher = (await harness
      .serviceClass("WORKFLOW_DISPATCH")
      .start(harness.runtime)) as unknown as {
      execute(id: string): Promise<{
        ok: boolean;
        executionId?: string;
      }>;
    };

    const result = await dispatcher.execute(job.id);

    expect(result.ok).toBe(true);
    expect(result.executionId).toBeTruthy();
    expect(harness.cron.recentRuns(1)[0]).toMatchObject({
      jobId: job.id,
      status: "completed",
    });
  });
});
