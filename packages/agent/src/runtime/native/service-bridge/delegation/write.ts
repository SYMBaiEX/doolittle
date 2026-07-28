import type { DelegationOrchestrationMode } from "@/types/runtime";
import type { RuntimeLike } from "../runtime";
import {
  projectOfficialTask,
  requireOfficialOrchestrator,
  upsertDelegationProjection,
} from "./official";
import type { EffectiveDelegationCreateInput } from "./types";

function metadataFor(input: EffectiveDelegationCreateInput) {
  return {
    ...(input.metadata ?? {}),
    group: input.group,
    profile: input.profile,
    priority: input.priority,
    labels: input.labels ?? input.tags,
    tags: input.tags ?? input.labels,
    executionMode: input.executionMode,
    orchestrationMode: input.orchestrationMode,
    maxAttempts: input.maxAttempts,
    workspaceRoot: input.workspaceRoot,
  };
}

export async function retryEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: unknown,
  id: string,
  note?: string,
  _options?: { cascadeChildren?: boolean },
) {
  const task = await requireOfficialOrchestrator(runtime).retryTaskTurn(id, {
    instruction: note?.trim() || "Retry this task from its durable context.",
    mode: "new-session",
  });
  return task
    ? upsertDelegationProjection(services, projectOfficialTask(task))
    : null;
}

export async function createEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: unknown,
  input: EffectiveDelegationCreateInput,
) {
  const service = requireOfficialOrchestrator(runtime);
  const task = await service.createTask({
    title: input.title,
    goal: input.objective,
    originalRequest: input.objective,
    kind: "coding",
    priority: input.priority,
    providerPolicy: input.profile
      ? { preferredFramework: input.profile }
      : undefined,
    metadata: metadataFor(input),
  });
  return upsertDelegationProjection(services, projectOfficialTask(task));
}

export async function spawnEffectiveDelegationChild(
  runtime: RuntimeLike,
  services: unknown,
  parentId: string,
  input: {
    title: string;
    objective: string;
    group?: string;
    profile?: string;
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
    kind: "coding",
    parentTaskId: parentId,
    priority: input.priority,
    providerPolicy: input.profile
      ? { preferredFramework: input.profile }
      : undefined,
    metadata: metadataFor(input),
  });
  return upsertDelegationProjection(services, projectOfficialTask(task));
}

export async function cancelEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: unknown,
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
  return task
    ? upsertDelegationProjection(services, projectOfficialTask(task))
    : null;
}

export async function addEffectiveDelegationNote(
  runtime: RuntimeLike,
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
  return task ? projectOfficialTask(task) : null;
}

export async function completeEffectiveDelegationTask(
  runtime: RuntimeLike,
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
  return task ? projectOfficialTask(task) : null;
}

export async function executeEffectiveDelegationTask(
  runtime: RuntimeLike,
  id: string,
) {
  const service = requireOfficialOrchestrator(runtime);
  const detail = await service.getTask(id);
  if (!detail) return null;
  const workspaceRoot =
    typeof detail.metadata.workspaceRoot === "string"
      ? detail.metadata.workspaceRoot
      : undefined;
  const task = await service.spawnAgentForTask(id, {
    workdir: workspaceRoot,
    framework: detail.providerPolicy?.preferredFramework,
  });
  return task ? projectOfficialTask(task) : null;
}
