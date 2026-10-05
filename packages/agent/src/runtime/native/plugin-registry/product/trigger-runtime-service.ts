import {
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
} from "@doolittle/contracts";
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
import { requestWorkerHost } from "@/runtime/bootstrap/worker-host-rpc";
import {
  automationTriggerMatches,
  buildAutomationDefinition,
  evaluateAutomationCondition,
  normalizeAutomationAction,
  normalizeAutomationCondition,
  normalizeAutomationTrigger,
} from "@/services/automation/definition";
import type {
  AutomationExecutionContext,
  AutomationExecutor,
  AutomationJobRecord,
  AutomationRunRecord,
  AutomationRuntimeOverrides,
} from "@/services/automation/types";

type AutomationInput = Omit<
  AutomationJobRecord,
  "id" | "status" | "oneShot" | "createdAt" | "updatedAt" | "targetApprovalId"
> & {
  trigger?: AutomationJobRecord["trigger"];
};
type AutomationPatch = Partial<
  Pick<
    AutomationJobRecord,
    | "name"
    | "prompt"
    | "schedule"
    | "skills"
    | "delivery"
    | "runtime"
    | "trigger"
    | "condition"
    | "action"
    | "targetBotId"
  >
> & { clearRuntime?: boolean };
const AUTOMATION_METADATA_KEY = "doolittleAutomation";
const AUTOMATION_RUN_METADATA_KEY = "doolittleAutomationRun";
const AUTOMATION_RUN_TASK_NAME = "DOOLITTLE_AUTOMATION_RUN";
const AUTOMATION_RUN_TASK_TAG = "doolittle-automation-run";

function durationMs(schedule: string): number | undefined {
  const match = schedule
    .trim()
    .toLowerCase()
    .match(/^(?:every\s+)?(\d+)(m|h|d)$/u);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return match[2] === "m"
    ? amount * 60_000
    : match[2] === "h"
      ? amount * 3_600_000
      : amount * 86_400_000;
}

function normalizeRuntimeOverrides(
  runtime?: AutomationRuntimeOverrides,
): AutomationRuntimeOverrides | undefined {
  if (!runtime) return undefined;
  const normalized: AutomationRuntimeOverrides = {};
  if (runtime.provider?.trim()) normalized.provider = runtime.provider.trim();
  if (runtime.model?.trim()) normalized.model = runtime.model.trim();
  if (runtime.baseUrl?.trim()) normalized.baseUrl = runtime.baseUrl.trim();
  if (
    typeof runtime.temperature === "number" &&
    Number.isFinite(runtime.temperature)
  ) {
    normalized.temperature = runtime.temperature;
  }
  if (
    typeof runtime.maxTokens === "number" &&
    Number.isFinite(runtime.maxTokens)
  ) {
    normalized.maxTokens = Math.max(1, Math.trunc(runtime.maxTokens));
  }
  if (runtime.personalityId?.trim()) {
    normalized.personalityId = runtime.personalityId.trim();
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function scheduleDraft(job: AutomationJobRecord) {
  if (job.trigger?.type === "manual" || job.trigger?.type === "webhook") {
    return {
      triggerType: "event" as const,
      eventKind:
        job.trigger.type === "webhook"
          ? `doolittle.webhook.${job.trigger.token}`
          : `doolittle.manual.${job.id}`,
    };
  }
  const duration = durationMs(job.schedule);
  if (job.schedule.trim().toLowerCase().startsWith("every ") && duration)
    return { triggerType: "interval" as const, intervalMs: duration };
  if (duration)
    return {
      triggerType: "once" as const,
      scheduledAtIso:
        job.nextRunAt ?? new Date(Date.now() + duration).toISOString(),
      maxRuns: 1,
    };
  return { triggerType: "cron" as const, cronExpression: job.schedule.trim() };
}

function metadataFor(
  job: AutomationJobRecord,
  task?: Task,
): TriggerTaskMetadata {
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
  if (!normalized.draft)
    throw new Error(normalized.error ?? "Invalid Eliza trigger definition.");
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
  const base = metadata ?? {
    ...((task?.metadata as TriggerTaskMetadata | undefined) ?? {}),
    blocking: true,
    updatedAt: Date.now(),
    updateInterval: DISABLED_TRIGGER_INTERVAL_MS,
    trigger: { ...trigger, nextRunAtMs: previous?.nextRunAtMs },
  };
  // Seed the SDK's documented minute-bucket identity on the persisted first
  // scheduled task; its own execution runtime refreshes this for later fires.
  const nextRunAtMs = base.trigger?.nextRunAtMs;
  return {
    ...base,
    ...(job.trigger?.type === "schedule" && typeof nextRunAtMs === "number"
      ? { idempotencyKey: `${job.id}:${Math.floor(nextRunAtMs / 60_000)}` }
      : {}),
    [AUTOMATION_METADATA_KEY]: JSON.stringify(job),
  };
}

function readJob(task: Task): AutomationJobRecord | undefined {
  const encoded = (task.metadata as TriggerTaskMetadata | undefined)?.[
    AUTOMATION_METADATA_KEY
  ];
  if (typeof encoded !== "string") return undefined;
  try {
    return JSON.parse(encoded) as AutomationJobRecord;
  } catch {
    return undefined;
  }
}

function jobFromTask(task: Task): AutomationJobRecord | undefined {
  const job = readJob(task);
  const trigger = readTriggerConfig(task);
  if (!job || !trigger) return job;
  return {
    ...job,
    status: trigger.enabled ? "active" : "paused",
    oneShot: trigger.triggerType === "once",
    lastRunAt: trigger.lastRunAtIso,
    nextRunAt:
      typeof trigger.nextRunAtMs === "number"
        ? new Date(trigger.nextRunAtMs).toISOString()
        : undefined,
  };
}

function readRunReceipt(task: Task): AutomationRunRecord | undefined {
  const encoded = (task.metadata as TriggerTaskMetadata | undefined)?.[
    AUTOMATION_RUN_METADATA_KEY
  ];
  if (typeof encoded !== "string") return undefined;
  try {
    return JSON.parse(encoded) as AutomationRunRecord;
  } catch {
    return undefined;
  }
}

async function persistRunReceipt(
  runtime: IAgentRuntime,
  receipt: AutomationRunRecord,
): Promise<void> {
  await runtime.createTask({
    id: receipt.id as UUID,
    name: AUTOMATION_RUN_TASK_NAME,
    description: `${receipt.jobName} · ${receipt.status ?? "completed"}`,
    tags: [AUTOMATION_RUN_TASK_TAG],
    metadata: {
      [AUTOMATION_RUN_METADATA_KEY]: JSON.stringify(receipt),
    },
  } as Task);
}

function sourceFromDispatchPayload(
  payload: Record<string, unknown>,
): AutomationExecutionContext["source"] {
  const eventKind =
    typeof payload.eventKind === "string" ? payload.eventKind : "";
  if (eventKind.startsWith("doolittle.webhook.")) return "webhook";
  if (eventKind.startsWith("doolittle.manual.")) return "manual";
  return "schedule";
}

async function executeAutomation(
  executor: AutomationExecutor,
  job: AutomationJobRecord,
  context: AutomationExecutionContext,
): Promise<AutomationRunRecord> {
  if (!automationTriggerMatches(job, context.source)) {
    throw new Error(
      `Automation "${job.name}" cannot be invoked by a ${context.source} trigger.`,
    );
  }

  const startedAt = new Date();
  const executionId = context.executionId ?? crypto.randomUUID();
  let ownedRun: { botId: string; sessionId: string; runId: string } | undefined;
  const trace: NonNullable<AutomationRunRecord["trace"]> = [
    {
      id: crypto.randomUUID(),
      phase: "trigger",
      status: "completed",
      message: `${context.source} trigger accepted.`,
      createdAt: startedAt.toISOString(),
    },
  ];
  const condition = evaluateAutomationCondition(job.condition, context.payload);
  if (!condition.matched) {
    const completedAt = new Date();
    trace.push({
      id: crypto.randomUUID(),
      phase: "condition",
      status: "skipped",
      message: condition.detail,
      createdAt: completedAt.toISOString(),
    });
    return {
      id: crypto.randomUUID(),
      jobId: job.id,
      jobName: job.name,
      output: condition.detail,
      createdAt: completedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      status: "skipped",
      triggerType: context.source,
      actionType: job.action?.type ?? "prompt",
      trace,
    };
  }

  trace.push({
    id: crypto.randomUUID(),
    phase: "condition",
    status: "completed",
    message: condition.detail,
    createdAt: new Date().toISOString(),
  });
  let output = "";
  let status: AutomationRunRecord["status"] = "completed";
  try {
    output = await executor(job, {
      ...context,
      executionId,
      onOwnedRun: (owner) => {
        ownedRun = owner;
        context.onOwnedRun?.(owner);
      },
      onProgress: async (progress) => {
        await context.onProgress?.(progress);
        trace.push({
          id: crypto.randomUUID(),
          phase: progress.phase,
          status:
            progress.status === "failed" || progress.status === "cancelled"
              ? "failed"
              : "completed",
          message: progress.message,
          createdAt: new Date().toISOString(),
        });
      },
    });
    trace.push({
      id: crypto.randomUUID(),
      phase: "action",
      status: "completed",
      message: `${job.action?.type ?? "prompt"} action completed.`,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    status = "failed";
    output = `Automation failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    trace.push({
      id: crypto.randomUUID(),
      phase: "action",
      status,
      message: output,
      createdAt: new Date().toISOString(),
    });
  }
  const completedAt = new Date();
  trace.push({
    id: crypto.randomUUID(),
    phase: "delivery",
    status,
    message:
      status === "failed"
        ? "Failure receipt recorded."
        : `Delivery mode ${job.delivery} completed.`,
    createdAt: completedAt.toISOString(),
  });
  return {
    id: executionId,
    jobId: job.id,
    jobName: job.name,
    targetBotId: job.targetBotId ?? "default",
    ...(ownedRun
      ? { targetSessionId: ownedRun.sessionId, targetRunId: ownedRun.runId }
      : {}),
    output,
    createdAt: completedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    status,
    triggerType: context.source,
    actionType: job.action?.type ?? "prompt",
    trace,
  };
}

async function taskForJob(runtime: IAgentRuntime, id: string) {
  const task = await runtime.getTask(id as UUID);
  if (task && jobFromTask(task)) return task;
  return (await listTriggerTasks(runtime)).find(
    (candidate) => candidate.id === id || jobFromTask(candidate)?.id === id,
  );
}

async function persistJob(
  runtime: IAgentRuntime,
  job: AutomationJobRecord,
  task?: Task,
): Promise<Task> {
  const metadata = metadataFor(job, task);
  if (task?.id) {
    await runtime.updateTask(task.id, { description: job.name, metadata });
    return { ...task, description: job.name, metadata };
  }
  await runtime.createTask({
    id: job.id as UUID,
    name: TRIGGER_TASK_NAME,
    description: job.name,
    tags: [...TRIGGER_TASK_TAGS, "doolittle-automation"],
    metadata,
  } as Task);
  const created = await runtime.getTask(job.id as UUID);
  if (!created)
    throw new Error(`Eliza trigger task was not persisted for "${job.name}".`);
  return created;
}

function newJob(input: AutomationInput): AutomationJobRecord {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const definition = buildAutomationDefinition(input);
  return {
    id,
    targetBotId: input.targetBotId ?? "default",
    name: input.name.trim(),
    prompt: definition.prompt,
    schedule: definition.schedule,
    skills: input.skills ?? [],
    delivery: input.delivery ?? "local",
    runtime: normalizeRuntimeOverrides(input.runtime),
    status: "active",
    oneShot:
      definition.trigger.type === "schedule" &&
      !definition.trigger.schedule.startsWith("every "),
    createdAt: now,
    updatedAt: now,
    trigger: definition.trigger,
    condition: definition.condition,
    action: definition.action,
  };
}

function updatedJob(
  previous: AutomationJobRecord,
  patch: AutomationPatch,
): AutomationJobRecord {
  const job = structuredClone(previous);
  if (
    patch.targetBotId !== undefined &&
    patch.targetBotId !== (previous.targetBotId ?? "default")
  )
    throw new Error(
      "An automation target is immutable. Create a new automation for another bot.",
    );
  if (patch.name !== undefined) job.name = patch.name.trim();
  if (patch.prompt !== undefined) {
    job.prompt = patch.prompt.trim();
    if (job.action?.type !== "webhook") {
      job.action = normalizeAutomationAction(
        job.action ? { ...job.action, prompt: job.prompt } : undefined,
        job.prompt,
      );
    }
  }
  if (patch.trigger !== undefined || patch.schedule !== undefined) {
    const trigger = normalizeAutomationTrigger(
      patch.trigger,
      patch.schedule,
      job.trigger,
    );
    job.trigger = trigger;
    job.schedule =
      trigger.type === "schedule" ? trigger.schedule : trigger.type;
    job.oneShot =
      trigger.type === "schedule" && !trigger.schedule.startsWith("every ");
    job.nextRunAt = undefined;
  }
  if (patch.condition !== undefined) {
    job.condition = normalizeAutomationCondition(patch.condition);
  }
  if (patch.action !== undefined) {
    job.action = normalizeAutomationAction(patch.action);
    job.prompt =
      job.action.type === "webhook"
        ? `POST ${job.action.url}`
        : job.action.prompt;
  }
  if (patch.skills !== undefined) job.skills = [...patch.skills];
  if (patch.delivery !== undefined) job.delivery = patch.delivery;
  if (patch.clearRuntime) {
    job.runtime = undefined;
  } else if (patch.runtime !== undefined) {
    job.runtime = normalizeRuntimeOverrides(patch.runtime);
  }
  job.updatedAt = new Date().toISOString();
  return job;
}

async function approveNamedJob(job: AutomationJobRecord): Promise<void> {
  if ((job.targetBotId ?? "default") === "default") return;
  if (
    job.skills.length ||
    job.runtime ||
    job.delivery === "home" ||
    job.trigger?.type === "webhook" ||
    job.action?.type === "webhook"
  )
    throw new Error(
      "Named automations do not support lead-loaded skills, runtime/model overrides, home delivery, or webhook triggers/actions.",
    );
  if (
    process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1" ||
    process.env.DOOLITTLE_BOT_RUNTIME === "worker"
  )
    throw new Error(
      "Named-bot automations require the application-owned desktop scheduler.",
    );
  const receipt = (await requestWorkerHost(
    "automation.validate",
    { job },
    { timeoutMs: 120_000 },
  )) as { targetBotId?: unknown; approvalId?: unknown };
  if (
    typeof receipt.targetBotId !== "string" ||
    typeof receipt.approvalId !== "string" ||
    !/^[0-9a-f-]{36}$/iu.test(receipt.approvalId)
  )
    throw new Error("Named automation host approval is unavailable.");
  job.targetBotId = receipt.targetBotId;
  job.targetApprovalId = receipt.approvalId;
}

export function createTriggerRuntimeServices(
  createExecutor: (runtime: IAgentRuntime) => AutomationExecutor,
): ServiceClass[] {
  class TriggerWorkflowDispatchService extends ElizaService {
    static serviceType = DOOLITTLE_WORKFLOW_DISPATCH_SERVICE;
    capabilityDescription =
      "Dispatches persisted Eliza workflow triggers through Doolittle automation execution.";
    private readonly executor = createExecutor(this.runtime);

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new TriggerWorkflowDispatchService(runtime);
    }

    async execute(
      workflowId: string,
      payload: Record<string, unknown> = {},
      dispatch: { idempotencyKey?: string } = {},
    ) {
      const task = await taskForJob(this.runtime, workflowId);
      const job = task && readJob(task);
      if (!task || !job)
        return { ok: false, error: `Cron job not found: ${workflowId}` };
      try {
        const eventPayload =
          payload.eventPayload &&
          typeof payload.eventPayload === "object" &&
          !Array.isArray(payload.eventPayload)
            ? (payload.eventPayload as Record<string, unknown>)
            : undefined;
        const receipt = await executeAutomation(this.executor, job, {
          source: sourceFromDispatchPayload(payload),
          payload: eventPayload,
          idempotencyKey: dispatch.idempotencyKey,
        });
        await persistRunReceipt(this.runtime, receipt);
        return receipt.status === "failed"
          ? { ok: false, error: receipt.output, executionId: receipt.id }
          : { ok: true, executionId: receipt.id };
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
    static serviceType = DOOLITTLE_AUTOMATION_SERVICE;
    capabilityDescription =
      "Maps Doolittle automation UX directly onto persisted Eliza Trigger Tasks.";
    private readonly manualFires = new Map<string, Promise<unknown>>();
    private async manualFire<T>(
      id: string,
      execute: (task: Task) => Promise<T>,
    ): Promise<T> {
      const active = this.manualFires.get(id);
      if (active) return active as Promise<T>;
      const pending = (async () => {
        let task = await taskForJob(this.runtime, id);
        const job = task && jobFromTask(task);
        if (!task || !job) throw new Error(`Cron job not found: ${id}`);
        if ((job.targetBotId ?? "default") === "default") return execute(task);
        const metadata = task.metadata as TriggerTaskMetadata & {
          doolittleManualFire?: { key: string; pending: boolean };
        };
        const saved = metadata.doolittleManualFire;
        if (
          saved &&
          (typeof saved.key !== "string" ||
            !saved.key.startsWith(`${id}:manual:`) ||
            typeof saved.pending !== "boolean")
        )
          throw new Error("Named manual fire bookkeeping requires recovery.");
        // A prior uncertain fire is retried with its saved identity, never replayed
        // under a fresh key. Only a completed explicit user fire permits a new key.
        const key = saved?.pending
          ? saved.key
          : `${id}:manual:${crypto.randomUUID()}`;
        await this.runtime.updateTask(task.id as UUID, {
          metadata: {
            ...metadata,
            idempotencyKey: key,
            doolittleManualFire: { key, pending: true },
          },
        });
        task = await taskForJob(this.runtime, id);
        if (
          !task ||
          JSON.stringify(jobFromTask(task)) !== JSON.stringify(job) ||
          (task.metadata as TriggerTaskMetadata).idempotencyKey !== key
        )
          throw new Error(
            "Automation changed before its manual fire was persisted.",
          );
        const clearPending = async () => {
          const current = await taskForJob(this.runtime, id);
          const currentMetadata = current?.metadata as
            | (TriggerTaskMetadata & {
                doolittleManualFire?: { key: string; pending: boolean };
              })
            | undefined;
          if (current?.id && currentMetadata?.doolittleManualFire?.key === key)
            await this.runtime.updateTask(current.id, {
              metadata: {
                ...currentMetadata,
                doolittleManualFire: { key, pending: false },
              },
            });
        };
        try {
          const result = await execute(task);
          await clearPending();
          return result;
        } catch (error) {
          // Cancellation/rejection is terminal and allows a later explicit new
          // fire; an uncertain or still-active submission retains the old key.
          const state = (await requestWorkerHost("automation.status", {
            jobId: id,
            idempotencyKey: key,
          }).catch(() => undefined)) as { status?: string } | undefined;
          if (
            state &&
            ["complete", "cancelled", "error"].includes(state.status ?? "")
          )
            await clearPending();
          throw error;
        }
      })();
      this.manualFires.set(id, pending);
      try {
        return await pending;
      } finally {
        if (this.manualFires.get(id) === pending) this.manualFires.delete(id);
      }
    }
    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new TriggerRuntimeService(runtime);
    }
    async list() {
      return (await listTriggerTasks(this.runtime))
        .map(jobFromTask)
        .filter((job): job is AutomationJobRecord => Boolean(job));
    }
    async get(id: string) {
      const task = await taskForJob(this.runtime, id);
      return task && jobFromTask(task);
    }
    async runs(limit = 25) {
      return (
        await this.runtime.getTasks({
          agentIds: [this.runtime.agentId],
          tags: [AUTOMATION_RUN_TASK_TAG],
        })
      )
        .map(readRunReceipt)
        .filter((receipt): receipt is AutomationRunRecord => Boolean(receipt))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit);
    }
    async create(input: AutomationInput) {
      const job = newJob(input);
      await approveNamedJob(job);
      await persistJob(this.runtime, job);
      return job;
    }
    async update(id: string, patch: AutomationPatch) {
      const task = await taskForJob(this.runtime, id);
      const previous = task && jobFromTask(task);
      if (!task || !previous) throw new Error(`Cron job not found: ${id}`);
      const job = updatedJob(previous, patch);
      if ((job.targetBotId ?? "default") !== "default")
        await approveNamedJob(job);
      const currentTask = await taskForJob(this.runtime, id);
      const current = currentTask && jobFromTask(currentTask);
      if (
        !currentTask ||
        !current ||
        JSON.stringify(current) !== JSON.stringify(previous)
      )
        throw new Error(
          "Automation changed during approval. Reload before editing.",
        );
      await persistJob(this.runtime, job, currentTask);
      return job;
    }
    async pause(id: string) {
      const task = await taskForJob(this.runtime, id);
      const job = task && jobFromTask(task);
      if (!task || !job) throw new Error(`Cron job not found: ${id}`);
      const updated = {
        ...job,
        status: "paused" as const,
        updatedAt: new Date().toISOString(),
      };
      await persistJob(this.runtime, updated, task);
      return updated;
    }
    async resume(id: string) {
      const task = await taskForJob(this.runtime, id);
      const job = task && jobFromTask(task);
      if (!task || !job) throw new Error(`Cron job not found: ${id}`);
      const updated = {
        ...job,
        status: "active" as const,
        updatedAt: new Date().toISOString(),
      };
      await persistJob(this.runtime, updated, task);
      return updated;
    }
    async runNow(id: string) {
      return this.manualFire(id, async (task) => {
        const previous = task && jobFromTask(task);
        if (!task || !previous) throw new Error(`Cron job not found: ${id}`);
        const result = await executeTriggerTask(this.runtime, task, {
          source: "manual",
          force: true,
          event: {
            kind: `doolittle.manual.${id}`,
            payload: {},
          },
        });
        if (result.status === "error")
          throw new Error(result.error ?? `Automation failed: ${id}`);
        const job = await this.get(id);
        return (
          job ?? {
            ...previous,
            status: "paused" as const,
            lastRunAt: new Date().toISOString(),
            nextRunAt: undefined,
          }
        );
      });
    }
    async triggerNow(
      id: string,
      source: "manual" | "webhook" = "manual",
      payload?: Record<string, unknown>,
    ) {
      if (source === "manual")
        return this.manualFire(id, (task) =>
          this.executeEvent(id, source, payload, task),
        );
      const task = await taskForJob(this.runtime, id);
      if (!task) throw new Error(`Cron job not found: ${id}`);
      return this.executeEvent(id, source, payload, task);
    }
    private async executeEvent(
      id: string,
      source: "manual" | "webhook",
      payload: Record<string, unknown> | undefined,
      task: Task,
    ) {
      const job = task && jobFromTask(task);
      if (!task || !job) throw new Error(`Cron job not found: ${id}`);
      let eventKind = `doolittle.manual.${id}`;
      if (source === "webhook") {
        if (job.trigger?.type !== "webhook") {
          throw new Error(`Webhook automation not found: ${id}`);
        }
        if (job.status !== "active") {
          throw new Error(`Cron job is paused: ${id}`);
        }
        eventKind = `doolittle.webhook.${job.trigger.token}`;
      }
      const result = await executeTriggerTask(this.runtime, task, {
        source: source === "webhook" ? "event" : "manual",
        force: source === "manual",
        event: {
          kind: eventKind,
          payload,
        },
      });
      if (result.status === "error")
        throw new Error(result.error ?? `Automation failed: ${id}`);
      if (result.status === "skipped")
        throw new Error(`Automation trigger was skipped: ${id}`);
      const receiptTask = result.executionId
        ? await this.runtime.getTask(result.executionId as UUID)
        : undefined;
      const receipt = receiptTask ? readRunReceipt(receiptTask) : undefined;
      if (!receipt) {
        throw new Error(`Automation receipt was not persisted: ${id}`);
      }
      return receipt;
    }
    async triggerWebhook(token: string, payload?: Record<string, unknown>) {
      const job = (await this.list()).find(
        (candidate) =>
          candidate.trigger?.type === "webhook" &&
          candidate.trigger.token === token,
      );
      if (!job) throw new Error("Webhook automation not found.");
      return this.triggerNow(job.id, "webhook", payload);
    }
    async remove(id: string) {
      const task = await taskForJob(this.runtime, id);
      if (!task) throw new Error(`Cron job not found: ${id}`);
      await this.runtime.deleteTask(task.id as UUID);
    }
    async reconcile(): Promise<void> {}
    async stop(): Promise<void> {}
  }
  return [TriggerWorkflowDispatchService, TriggerRuntimeService];
}
