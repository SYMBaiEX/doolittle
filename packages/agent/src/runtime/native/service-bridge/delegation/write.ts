import type { AppServices } from "@/services";
import type { DelegationOrchestrationMode } from "@/types/runtime";
import { getNativeServices, type RuntimeLike } from "../runtime";
import type { EffectiveDelegationCreateInput } from "./types";

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
