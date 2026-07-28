import type { AppServices } from "@doolittle/agent/plugin-api";
import {
  executeTriggerTask,
  listTriggerTasks,
  readTriggerConfig,
  TRIGGER_TASK_NAME,
  TRIGGER_TASK_TAGS,
} from "@elizaos/agent/triggers/runtime";
import {
  buildTriggerConfig,
  buildTriggerMetadata,
  DISABLED_TRIGGER_INTERVAL_MS,
  normalizeTriggerDraft,
} from "@elizaos/agent/triggers/scheduling";
import type { TriggerTaskMetadata } from "@elizaos/agent/triggers/types";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
  type ServiceClass,
  type Task,
  type UUID,
} from "@elizaos/core";

type AutomationInput = Parameters<AppServices["cron"]["create"]>[0];
type AutomationPatch = Parameters<AppServices["cron"]["update"]>[1];
type AutomationJob = ReturnType<AppServices["cron"]["create"]>;

const WORKFLOW_DISPATCH_SERVICE = "WORKFLOW_DISPATCH";
const CRON_SERVICE = "cron";

function durationMs(schedule: string): number | undefined {
  const match = schedule
    .trim()
    .toLowerCase()
    .match(/^(?:every\s+)?(\d+)(m|h|d)$/u);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (match[2] === "m") return amount * 60_000;
  if (match[2] === "h") return amount * 3_600_000;
  return amount * 86_400_000;
}

function scheduleDraft(job: AutomationJob) {
  const trigger = job.trigger;
  if (trigger?.type === "manual" || trigger?.type === "webhook") {
    return {
      triggerType: "event" as const,
      eventKind:
        trigger.type === "webhook"
          ? `doolittle.webhook.${job.id}`
          : `doolittle.manual.${job.id}`,
    };
  }

  const schedule = job.schedule.trim();
  const duration = durationMs(schedule);
  if (schedule.toLowerCase().startsWith("every ") && duration) {
    return { triggerType: "interval" as const, intervalMs: duration };
  }
  if (duration) {
    return {
      triggerType: "once" as const,
      scheduledAtIso:
        job.nextRunAt ?? new Date(Date.now() + duration).toISOString(),
      maxRuns: 1,
    };
  }
  return {
    triggerType: "cron" as const,
    cronExpression: schedule,
  };
}

function triggerMetadata(job: AutomationJob, task?: Task) {
  const schedule = scheduleDraft(job);
  const normalized = normalizeTriggerDraft({
    input: {
      displayName: job.name,
      instructions: job.prompt,
      enabled: job.status === "active",
      createdBy: "doolittle",
      wakeMode: "inject_now",
      kind: "workflow",
      workflowId: job.id,
      workflowName: job.name,
      ...schedule,
    },
    fallback: {
      displayName: job.name,
      instructions: job.prompt,
      triggerType: schedule.triggerType,
      wakeMode: "inject_now",
      enabled: job.status === "active",
      createdBy: "doolittle",
    },
  });
  if (!normalized.draft) {
    throw new Error(normalized.error ?? "Invalid Eliza trigger definition.");
  }

  const previous = task ? (readTriggerConfig(task) ?? undefined) : undefined;
  const trigger = buildTriggerConfig({
    draft: normalized.draft,
    triggerId: (previous?.triggerId ?? job.id) as UUID,
    previous,
  });
  const metadata = buildTriggerMetadata({
    existingMetadata: task?.metadata as TriggerTaskMetadata | undefined,
    trigger,
    nowMs: Date.now(),
  });
  if (!metadata && !trigger.enabled) {
    return {
      ...((task?.metadata as TriggerTaskMetadata | undefined) ?? {}),
      blocking: true,
      updatedAt: Date.now(),
      updateInterval: DISABLED_TRIGGER_INTERVAL_MS,
      trigger: {
        ...trigger,
        nextRunAtMs: previous?.nextRunAtMs,
      },
    };
  }
  if (!metadata) {
    throw new Error(`Could not schedule automation "${job.name}".`);
  }
  return metadata;
}

async function findTaskForWorkflow(
  runtime: IAgentRuntime,
  workflowId: string,
): Promise<Task | undefined> {
  const tasks = await listTriggerTasks(runtime);
  return tasks.find(
    (task) => readTriggerConfig(task)?.workflowId === workflowId,
  );
}

async function syncJobTask(
  runtime: IAgentRuntime,
  job: AutomationJob,
): Promise<Task> {
  const existing = await findTaskForWorkflow(runtime, job.id);
  const metadata = triggerMetadata(job, existing);
  if (existing?.id) {
    await runtime.updateTask(existing.id, {
      description: job.name,
      metadata,
    });
    return { ...existing, description: job.name, metadata };
  }

  const taskId = await runtime.createTask({
    name: TRIGGER_TASK_NAME,
    description: job.name,
    tags: [...TRIGGER_TASK_TAGS, "doolittle-automation"],
    metadata,
  });
  const task = await runtime.getTask(taskId);
  if (!task) {
    throw new Error(`Eliza trigger task was not persisted for "${job.name}".`);
  }
  return task;
}

function restoreJob(
  services: AppServices,
  previous: AutomationJob,
): AutomationJob {
  const restored = services.cron.update(previous.id, {
    name: previous.name,
    prompt: previous.prompt,
    schedule: previous.schedule,
    skills: previous.skills,
    delivery: previous.delivery,
    runtime: previous.runtime,
    trigger: previous.trigger,
    condition: previous.condition,
    action: previous.action,
  });
  return previous.status === "paused"
    ? services.cron.pause(restored.id)
    : services.cron.resume(restored.id);
}

export function createTriggerRuntimeServices(
  services: AppServices,
): ServiceClass[] {
  class TriggerWorkflowDispatchService extends ElizaService {
    static serviceType = WORKFLOW_DISPATCH_SERVICE;

    capabilityDescription =
      "Dispatches persisted Eliza workflow triggers through Doolittle automation execution.";

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new TriggerWorkflowDispatchService(runtime);
    }

    async execute(
      workflowId: string,
      payload: Record<string, unknown> = {},
    ): Promise<{ ok: boolean; executionId?: string; error?: string }> {
      try {
        const eventPayload =
          payload.eventPayload &&
          typeof payload.eventPayload === "object" &&
          !Array.isArray(payload.eventPayload)
            ? (payload.eventPayload as Record<string, unknown>)
            : undefined;
        const run = await services.cron.triggerNow(
          workflowId,
          eventPayload ? "webhook" : "manual",
          eventPayload,
        );
        return { ok: true, executionId: run.id };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    async stop(): Promise<void> {}
  }

  class TriggerRuntimeService extends ElizaService {
    static serviceType = CRON_SERVICE;

    capabilityDescription =
      "Maps Doolittle automation UX onto persisted Eliza Trigger Tasks.";

    static async start(runtime: IAgentRuntime): Promise<Service> {
      const service = new TriggerRuntimeService(runtime);
      await service.reconcile();
      return service;
    }

    list(): AutomationJob[] {
      return services.cron.list();
    }

    get(id: string): AutomationJob | undefined {
      return services.cron.get(id);
    }

    runs(limit = 25) {
      return services.cron.runs(limit);
    }

    async create(input: AutomationInput): Promise<AutomationJob> {
      const job = services.cron.create(input);
      try {
        await syncJobTask(this.runtime, job);
        return job;
      } catch (error) {
        services.cron.remove(job.id);
        throw error;
      }
    }

    async update(id: string, patch: AutomationPatch): Promise<AutomationJob> {
      const previous = services.cron.get(id);
      if (!previous) throw new Error(`Cron job not found: ${id}`);
      const updated = services.cron.update(id, patch);
      try {
        await syncJobTask(this.runtime, updated);
        return updated;
      } catch (error) {
        restoreJob(services, previous);
        throw error;
      }
    }

    async pause(id: string): Promise<AutomationJob> {
      const previous = services.cron.get(id);
      if (!previous) throw new Error(`Cron job not found: ${id}`);
      const paused = services.cron.pause(id);
      try {
        await syncJobTask(this.runtime, paused);
        return paused;
      } catch (error) {
        restoreJob(services, previous);
        throw error;
      }
    }

    async resume(id: string): Promise<AutomationJob> {
      const previous = services.cron.get(id);
      if (!previous) throw new Error(`Cron job not found: ${id}`);
      const resumed = services.cron.resume(id);
      try {
        await syncJobTask(this.runtime, resumed);
        return resumed;
      } catch (error) {
        restoreJob(services, previous);
        throw error;
      }
    }

    async runNow(id: string): Promise<AutomationJob> {
      let task = await findTaskForWorkflow(this.runtime, id);
      if (!task) {
        const job = services.cron.get(id);
        if (!job) throw new Error(`Cron job not found: ${id}`);
        task = await syncJobTask(this.runtime, job);
      }
      const result = await executeTriggerTask(this.runtime, task, {
        source: "manual",
        force: true,
      });
      if (result.status === "error") {
        throw new Error(result.error ?? `Automation failed: ${id}`);
      }
      const job = services.cron.get(id);
      if (!job) throw new Error(`Cron job not found: ${id}`);
      return job;
    }

    async triggerNow(
      id: string,
      source: "manual" | "webhook" = "manual",
      payload?: Record<string, unknown>,
    ) {
      const task = await findTaskForWorkflow(this.runtime, id);
      if (!task) throw new Error(`Cron job not found: ${id}`);
      const result = await executeTriggerTask(
        this.runtime,
        task,
        source === "webhook"
          ? {
              source: "event",
              force: true,
              event: { kind: `doolittle.webhook.${id}`, payload },
            }
          : { source: "manual", force: true },
      );
      if (result.status === "error") {
        throw new Error(result.error ?? `Automation failed: ${id}`);
      }
      return services.cron.recentRuns(1)[0];
    }

    async triggerWebhook(token: string, payload?: Record<string, unknown>) {
      const job = services.cron
        .list()
        .find(
          (candidate) =>
            candidate.trigger?.type === "webhook" &&
            candidate.trigger.token === token,
        );
      if (!job) throw new Error("Webhook automation not found.");
      return this.triggerNow(job.id, "webhook", payload);
    }

    async remove(id: string): Promise<void> {
      const task = await findTaskForWorkflow(this.runtime, id);
      if (task?.id) await this.runtime.deleteTask(task.id);
      services.cron.remove(id);
    }

    async reconcile(): Promise<void> {
      services.cron.stop();
      for (const job of services.cron.list()) {
        await syncJobTask(this.runtime, job);
      }
    }

    async stop(): Promise<void> {
      services.cron.stop();
    }
  }

  return [TriggerWorkflowDispatchService, TriggerRuntimeService];
}
