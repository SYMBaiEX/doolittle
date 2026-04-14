import type { AppServices } from "@/services";
import { getNativeServices, type RuntimeLike } from "../runtime";

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
