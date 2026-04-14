import type { AwarenessRegistry } from "@elizaos/autonomous/awareness/registry";
import type { AppServices } from "../types";

export interface AwarenessServiceState {
  registry: AwarenessRegistry | null;
}

export function createAwarenessServiceState(): AwarenessServiceState {
  return { registry: null };
}

export function activeRuns(services: AppServices) {
  return services.runController
    .listActive()
    .filter((run) => run.endedAt === undefined);
}

export function countContributors(state: AwarenessServiceState): number {
  const registry = state.registry as { contributors?: unknown[] } | null;
  return registry?.contributors?.length ?? 0;
}
