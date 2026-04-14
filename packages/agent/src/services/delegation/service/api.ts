import type { DelegationServiceApi } from "./api-types";
import { createDelegationServiceMutationFacade } from "./mutation-facade";
import { createDelegationServiceQueueFacade } from "./queue-facade";
import { createDelegationServiceReadFacade } from "./read-facade";
import type { DelegationServiceSupport } from "./support";

export function createDelegationServiceApi(
  support: DelegationServiceSupport,
): DelegationServiceApi {
  const reads = createDelegationServiceReadFacade(support);
  const mutations = createDelegationServiceMutationFacade(support, reads);
  const queue = createDelegationServiceQueueFacade(support, reads, mutations);

  return {
    ...reads,
    ...mutations,
    ...queue,
    onUpdate: (listener) => support.onUpdate(listener),
    getWorkerPaths: (id) => support.getWorkerPaths(id),
  };
}
