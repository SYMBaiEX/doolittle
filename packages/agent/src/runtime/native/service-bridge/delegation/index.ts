import type { AppServices } from "@/services";
import type { DelegationOrchestrationMode } from "@/types/runtime";
import { getNativeServices, type RuntimeLike } from "../runtime";

export interface EffectiveDelegationCreateInput {
  title: string;
  objective: string;
  metadata?: Record<string, unknown>;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  labels?: string[];
  tags?: string[];
  executionMode?: "local" | "delegated";
  orchestrationMode?: DelegationOrchestrationMode;
  maxAttempts?: number;
}

export function getEffectiveDelegationTasks(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.tasks() ??
    getNativeServices(runtime).codingAgent?.tasks?.() ??
    services.delegation.list()
  );
}

export function getEffectiveDelegationQueue(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.queue() ??
    services.delegation.queueSummary()
  );
}

export function getEffectiveDelegationOverview(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.overview?.() ??
    services.delegation.overview()
  );
}

export function getEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: AppServices,
  id: string,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.getTask?.(id) ??
    services.delegation.get(id)
  );
}

export function getEffectiveDelegationChildren(
  runtime: RuntimeLike,
  services: AppServices,
  parentId: string,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.getChildren?.(parentId) ??
    services.delegation.listChildren(parentId)
  );
}

export function getEffectiveDelegationTree(
  runtime: RuntimeLike,
  services: AppServices,
  id: string,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.tree?.(id) ??
    services.delegation.tree(id)
  );
}

export function getEffectiveDelegationAggregation(
  runtime: RuntimeLike,
  services: AppServices,
  id: string,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.aggregate?.(id) ??
    services.delegation.aggregate(id)
  );
}

export function retryEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: AppServices,
  id: string,
  note?: string,
  options?: { cascadeChildren?: boolean },
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.retryTask?.(
      id,
      note,
      options,
    ) ?? services.delegation.requeue(id, note, options)
  );
}

export function createEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: AppServices,
  input: EffectiveDelegationCreateInput,
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.createTask(
      input.title,
      input.objective,
      {
        group: input.group,
        profile: input.profile,
        priority: input.priority,
        labels: input.labels ?? input.tags,
        tags: input.tags ?? input.labels,
        executionMode: input.executionMode,
        orchestrationMode: input.orchestrationMode,
        maxAttempts: input.maxAttempts,
        ...input.metadata,
      },
    ) ??
    getNativeServices(runtime).codingAgent?.delegate?.(
      input.title,
      input.objective,
      {
        group: input.group,
        profile: input.profile,
        priority: input.priority,
        labels: input.labels ?? input.tags,
        tags: input.tags ?? input.labels,
        executionMode: input.executionMode,
        orchestrationMode: input.orchestrationMode,
        maxAttempts: input.maxAttempts,
        ...input.metadata,
      },
    ) ??
    services.delegation.create({
      title: input.title,
      objective: input.objective,
      group: input.group,
      profile: input.profile,
      priority: input.priority,
      labels: input.labels ?? input.tags,
      tags: input.tags ?? input.labels,
      metadata: input.metadata
        ? Object.fromEntries(
            Object.entries(input.metadata).map(([key, value]) => [
              key,
              String(value),
            ]),
          )
        : undefined,
      executionMode: input.executionMode,
      orchestrationMode: input.orchestrationMode,
      maxAttempts: input.maxAttempts,
    })
  );
}

export function spawnEffectiveDelegationChild(
  runtime: RuntimeLike,
  services: AppServices,
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
    executionMode?: "local" | "delegated";
    orchestrationMode?: DelegationOrchestrationMode;
    maxAttempts?: number;
  },
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.spawnChild?.(parentId, {
      title: input.title,
      objective: input.objective,
      metadata: input.metadata,
      profile: input.profile,
      priority: input.priority,
      tags: input.tags ?? input.labels,
      orchestrationMode: input.orchestrationMode,
    }) ?? services.delegation.spawnChild(parentId, input)
  );
}

export function cancelEffectiveDelegationTask(
  runtime: RuntimeLike,
  services: AppServices,
  id: string,
  note?: string,
  options?: { cascadeChildren?: boolean },
) {
  return (
    getNativeServices(runtime).agentOrchestrator?.cancelTask?.(id, note) ??
    services.delegation.cancel(id, note, options)
  );
}

export async function superviseEffectiveDelegationQueue(
  runtime: RuntimeLike,
  services: AppServices,
  runner: (task: unknown) => Promise<string>,
  options?: {
    concurrency?: number;
    filter?: Record<string, unknown>;
    onComplete?: (task: unknown) => Promise<void> | void;
    onError?: (task: unknown, error: string) => Promise<void> | void;
  },
) {
  return (
    (await getNativeServices(runtime).agentOrchestrator?.supervise?.(
      runner,
      options,
    )) ?? services.delegation.supervise(runner as never, options as never)
  );
}
