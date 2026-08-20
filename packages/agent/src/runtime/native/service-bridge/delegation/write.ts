import { randomUUID } from "node:crypto";
import {
  type DoolittleResearchRuntime,
  runDoolittleResearch,
} from "@/actions/research-action";
import type { DelegationOrchestrationMode } from "@/types/runtime";
import type { RuntimeLike } from "../runtime";
import { projectOfficialTask, requireOfficialOrchestrator } from "./official";
import {
  abortResearchRun,
  isCurrentActiveResearchRun,
  isSessionlessResearchTask,
  markResearchRunLive,
  markResearchRunSettled,
  researchRunReceipt,
} from "./research-run";
import type {
  DelegationProjection,
  EffectiveDelegationCreateInput,
} from "./types";

function metadataFor(input: EffectiveDelegationCreateInput) {
  const capabilityProfile = input.capabilityProfile ?? input.profile;
  return {
    ...(input.metadata ?? {}),
    group: input.group,
    // `profile` remains available to existing Doolittle views, while the
    // canonical metadata makes the product capability explicit.
    profile: capabilityProfile,
    capabilityProfile,
    accountId: input.accountId,
    sessionId: input.sessionId,
    priority: input.priority,
    labels: input.labels ?? input.tags,
    tags: input.tags ?? input.labels,
    executionMode: input.executionMode,
    orchestrationMode: input.orchestrationMode,
    maxAttempts: input.maxAttempts,
    workspaceRoot: input.workspaceRoot,
  };
}

function taskKindFor(
  input: EffectiveDelegationCreateInput,
): "coding" | "research" {
  if (input.kind) return input.kind;
  return (input.capabilityProfile ?? input.profile) === "research"
    ? "research"
    : "coding";
}

function providerPolicyFor(input: EffectiveDelegationCreateInput) {
  return input.framework ? { preferredFramework: input.framework } : undefined;
}

function updateProjection(
  projection: DelegationProjection | undefined,
  task: ReturnType<typeof projectOfficialTask>,
) {
  projection?.upsertProjection(task);
  return task;
}

function isResearchTask(detail: {
  kind: string;
  metadata: Record<string, unknown>;
}) {
  return (
    detail.kind === "research" ||
    detail.metadata.capabilityProfile === "research" ||
    detail.metadata.profile === "research"
  );
}

function researchRunId() {
  return `research-${randomUUID()}`;
}

type ResearchExecutionResult = ReturnType<typeof projectOfficialTask> | null;
const activeResearchExecutions = new WeakMap<
  object,
  Map<string, Promise<ResearchExecutionResult>>
>();

export async function retryEffectiveDelegationTask(
  runtime: RuntimeLike,
  projection: DelegationProjection | undefined,
  id: string,
  note?: string,
  _options?: { cascadeChildren?: boolean },
) {
  const task = await requireOfficialOrchestrator(runtime).retryTaskTurn(id, {
    instruction: note?.trim() || "Retry this task from its durable context.",
    mode: "new-session",
  });
  return task ? updateProjection(projection, projectOfficialTask(task)) : null;
}

export async function createEffectiveDelegationTask(
  runtime: RuntimeLike,
  projection: DelegationProjection | undefined,
  input: EffectiveDelegationCreateInput,
) {
  const service = requireOfficialOrchestrator(runtime);
  const task = await service.createTask({
    title: input.title,
    goal: input.objective,
    originalRequest: input.objective,
    kind: taskKindFor(input),
    priority: input.priority,
    providerPolicy: providerPolicyFor(input),
    metadata: metadataFor(input),
  });
  return updateProjection(projection, projectOfficialTask(task));
}

export async function spawnEffectiveDelegationChild(
  runtime: RuntimeLike,
  projection: DelegationProjection | undefined,
  parentId: string,
  input: {
    title: string;
    objective: string;
    group?: string;
    profile?: string;
    capabilityProfile?: string;
    kind?: "coding" | "research";
    framework?: string;
    accountId?: string;
    sessionId?: string;
    priority?: "low" | "normal" | "high";
    tags?: string[];
    labels?: string[];
    metadata?: Record<string, string>;
    workspaceRoot?: string;
    executionMode?: "local" | "delegated";
    orchestrationMode?: DelegationOrchestrationMode;
    maxAttempts?: number;
  },
) {
  const service = requireOfficialOrchestrator(runtime);
  const task = await service.createTask({
    title: input.title,
    goal: input.objective,
    originalRequest: input.objective,
    kind: taskKindFor(input),
    parentTaskId: parentId,
    priority: input.priority,
    providerPolicy: providerPolicyFor(input),
    metadata: metadataFor(input),
  });
  return updateProjection(projection, projectOfficialTask(task));
}

export async function cancelEffectiveDelegationTask(
  runtime: RuntimeLike,
  projection: DelegationProjection | undefined,
  id: string,
  note?: string,
  _options?: { cascadeChildren?: boolean },
) {
  const service = requireOfficialOrchestrator(runtime);
  if (note?.trim()) {
    await service.addMessage(id, {
      content: note.trim(),
      senderKind: "system",
      direction: "system",
    });
  }
  const task = await service.pauseTask(id);
  if (!task) return null;

  // beta.7 providers ignore the structurally forwarded research signal; newer
  // providers can abort their request. Retain the durable interruption guard
  // in both cases so a late provider result cannot complete a cancelled task.
  const receipt = researchRunReceipt(task.metadata);
  if (
    isSessionlessResearchTask(task) &&
    receipt?.status === "active" &&
    typeof receipt.runId === "string"
  ) {
    const providerAbortRequested = abortResearchRun(id, receipt.runId);
    const interruptedAt = new Date().toISOString();
    const cancelled = await service.updateTask(id, {
      status: "interrupted",
      closedAt: interruptedAt,
      metadata: {
        ...task.metadata,
        researchRun: {
          ...receipt,
          status: "cancelled",
          cancelledAt: interruptedAt,
          interruption: "cooperative",
          providerAbortRequested,
        },
      },
    });
    return cancelled
      ? updateProjection(projection, projectOfficialTask(cancelled))
      : updateProjection(projection, projectOfficialTask(task));
  }
  return updateProjection(projection, projectOfficialTask(task));
}

export async function addEffectiveDelegationNote(
  runtime: RuntimeLike,
  projection: DelegationProjection | undefined,
  id: string,
  note: string,
) {
  const service = requireOfficialOrchestrator(runtime);
  const added = await service.addMessage(id, {
    content: note,
    senderKind: "orchestrator",
    direction: "system",
  });
  if (!added) return null;
  const task = await service.getTask(id);
  return task ? updateProjection(projection, projectOfficialTask(task)) : null;
}

export async function completeEffectiveDelegationTask(
  runtime: RuntimeLike,
  projection: DelegationProjection | undefined,
  id: string,
  note?: string,
) {
  const service = requireOfficialOrchestrator(runtime);
  const summary = note?.trim() || "Completed by operator.";
  const task = await service.validateTask(id, {
    passed: true,
    summary,
    evidence: summary,
    verifier: "doolittle-operator",
    humanOverride: true,
  });
  return task ? updateProjection(projection, projectOfficialTask(task)) : null;
}

export async function failEffectiveDelegationTask(
  runtime: RuntimeLike,
  projection: DelegationProjection | undefined,
  id: string,
  note?: string,
) {
  const service = requireOfficialOrchestrator(runtime);
  const summary = note?.trim() || "Failed by operator.";
  const existing = await service.getTask(id);
  if (!existing) return null;
  await service.addMessage(id, {
    content: summary,
    senderKind: "system",
    direction: "system",
  });
  await service.pauseTask(id);
  const task = await service.updateTask(id, {
    status: "failed",
    paused: true,
    summary,
    closedAt: new Date().toISOString(),
  });
  return task ? updateProjection(projection, projectOfficialTask(task)) : null;
}

export async function executeEffectiveDelegationTask(
  runtime: RuntimeLike,
  projection: DelegationProjection | undefined,
  id: string,
) {
  const service = requireOfficialOrchestrator(runtime);
  const detail = await service.getTask(id);
  if (!detail) return null;

  if (isResearchTask(detail)) {
    let executions = activeResearchExecutions.get(runtime);
    if (!executions) {
      executions = new Map();
      activeResearchExecutions.set(runtime, executions);
    }
    const activeExecution = executions.get(id);
    if (activeExecution) return activeExecution;
    const execution = (async (): Promise<ResearchExecutionResult> => {
      const detail = await service.getTask(id);
      if (!detail) return null;
      if (detail.paused || detail.status !== "open") {
        return updateProjection(projection, projectOfficialTask(detail));
      }
      const startedAt = new Date().toISOString();
      const runId = researchRunId();
      const currentRun = async () => {
        const current = await service.getTask(id);
        return current && isCurrentActiveResearchRun(current, runId)
          ? current
          : null;
      };
      const currentProjection = async () => {
        const current = await service.getTask(id);
        return current
          ? updateProjection(projection, projectOfficialTask(current))
          : null;
      };

      // Register synchronously before the first durable write. A concurrent
      // projection refresh must never mistake setup for a post-restart orphan.
      const researchSignal = markResearchRunLive(id, runId);
      // beta.7 has no typed external-execution primitive. Record the
      // sessionless research run through the durable task lifecycle instead of
      // pretending that an ACP coding session executed it.
      let durableResearchRunStarted = false;
      try {
        const started = await service.updateTask(id, {
          status: "active",
          metadata: {
            ...detail.metadata,
            researchRun: { runId, status: "active", startedAt },
          },
        });
        if (!started || !isCurrentActiveResearchRun(started, runId)) {
          throw new Error(
            "Unable to start Doolittle research: the durable task record was not activated.",
          );
        }
        durableResearchRunStarted = true;
        await service.addMessage(id, {
          content: `Starting Doolittle research run ${runId}.`,
          senderKind: "system",
          direction: "system",
        });
        const researchRuntime = runtime as RuntimeLike &
          Partial<DoolittleResearchRuntime>;
        if (
          typeof researchRuntime.getModel !== "function" ||
          typeof researchRuntime.useModel !== "function"
        ) {
          throw new Error(
            "Deep research is unavailable: the runtime has no RESEARCH model provider.",
          );
        }
        const research = await runDoolittleResearch(
          researchRuntime as DoolittleResearchRuntime,
          detail.goal,
          id,
          researchSignal,
        );
        const completedAt = new Date().toISOString();
        const receipt = {
          runId,
          status: "completed",
          startedAt,
          completedAt,
          responseId: research.responseId,
          sources: research.sources,
        };
        // Every mutation after the provider await is guarded by a fresh durable
        // read. Eliza does not yet offer a conditional task-update primitive.
        if (!(await currentRun())) return currentProjection();
        await service.addMessage(id, {
          content: research.report,
          senderKind: "sub_agent",
          direction: "stdout",
        });
        const latest = await currentRun();
        if (!latest) return currentProjection();
        await service.updateTask(id, {
          status: "validating",
          metadata: {
            ...latest.metadata,
            researchRun: receipt,
          },
        });
        // The validation transition persists the completed receipt. Re-read to
        // avoid validating if an operator cancelled during that await.
        const beforeValidate = await service.getTask(id);
        if (
          !beforeValidate ||
          beforeValidate.paused ||
          beforeValidate.status !== "validating" ||
          researchRunReceipt(beforeValidate.metadata)?.runId !== runId ||
          researchRunReceipt(beforeValidate.metadata)?.status !== "completed"
        ) {
          return currentProjection();
        }
        const validated = await service.validateTask(id, {
          passed: true,
          summary:
            research.sources.length > 0
              ? "Doolittle research completed with cited sources."
              : "Doolittle research completed.",
          evidence: research.report,
          verifier: "doolittle-research-executor",
          humanOverride: false,
        });
        return validated
          ? updateProjection(projection, projectOfficialTask(validated))
          : null;
      } catch (error) {
        // If the initial write never produced the active receipt, there is no
        // authoritative run to fail. Surface setup failure instead of silently
        // returning an unrelated pre-run projection.
        if (!durableResearchRunStarted) throw error;
        const failedAt = new Date().toISOString();
        const failure = error instanceof Error ? error.message : String(error);
        if (!(await currentRun())) return currentProjection();
        await service.addMessage(id, {
          content: `Doolittle research failed: ${failure}`,
          senderKind: "system",
          direction: "stderr",
        });
        const latest = await currentRun();
        if (!latest) return currentProjection();
        const failed = await service.updateTask(id, {
          status: "failed",
          closedAt: failedAt,
          metadata: {
            ...latest.metadata,
            researchRun: {
              runId,
              status: "failed",
              startedAt,
              failedAt,
              error: failure,
            },
          },
        });
        return failed
          ? updateProjection(projection, projectOfficialTask(failed))
          : null;
      } finally {
        markResearchRunSettled(id, runId);
      }
    })();
    executions.set(id, execution);
    try {
      return await execution;
    } finally {
      if (executions.get(id) === execution) executions.delete(id);
    }
  }

  const workspaceRoot =
    typeof detail.metadata.workspaceRoot === "string"
      ? detail.metadata.workspaceRoot
      : undefined;
  const task = await service.spawnAgentForTask(id, {
    workdir: workspaceRoot,
    framework: detail.providerPolicy?.preferredFramework,
  });
  return task ? updateProjection(projection, projectOfficialTask(task)) : null;
}
