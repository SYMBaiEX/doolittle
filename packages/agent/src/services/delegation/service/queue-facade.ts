import type {
  DelegationServiceMutationFacade,
  DelegationServiceQueueFacade,
  DelegationServiceReadFacade,
} from "./api-types";
import { superviseDelegationServiceQueue } from "./supervision";
import type { DelegationServiceSupport } from "./support";

export function createDelegationServiceQueueFacade(
  support: DelegationServiceSupport,
  reads: Pick<
    DelegationServiceReadFacade,
    "aggregate" | "get" | "overview" | "pending"
  >,
  mutations: Pick<
    DelegationServiceMutationFacade,
    "complete" | "fail" | "markRunning"
  >,
): DelegationServiceQueueFacade {
  function superviseQueued(
    runner: Parameters<DelegationServiceQueueFacade["superviseQueued"]>[0],
    options?: Parameters<DelegationServiceQueueFacade["superviseQueued"]>[1],
  ) {
    return superviseDelegationServiceQueue(
      {
        readTasks: () => support.read().tasks,
        pending: reads.pending,
        markRunning: mutations.markRunning,
        complete: mutations.complete,
        fail: mutations.fail,
        get: reads.get,
        aggregate: reads.aggregate,
        overview: reads.overview,
        adjustActiveExecutions: (delta) =>
          support.adjustActiveExecutions(delta),
      },
      runner,
      options,
    );
  }

  async function executeQueued(
    runner: Parameters<DelegationServiceQueueFacade["executeQueued"]>[0],
    options?: Parameters<DelegationServiceQueueFacade["executeQueued"]>[1],
  ) {
    const report = await superviseQueued(runner, options);
    return report.completed.map((id) => reads.get(id));
  }

  return {
    superviseQueued,
    executeQueued,
    queueSummary: () => reads.overview(),
    supervise: (runner, options) => superviseQueued(runner, options),
    runQueued: (runner, options) => executeQueued(runner, options),
  };
}
