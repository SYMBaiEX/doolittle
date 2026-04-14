import type { DelegationServiceReadFacade } from "./api-types";
import {
  buildDelegationServiceTreeById,
  getDelegationTaskById,
  listDelegationServiceByGroup,
  listDelegationServiceByLabel,
  listDelegationServiceByProfile,
  listDelegationServiceChildren,
  listDelegationServiceTasks,
  pendingDelegationServiceTasks,
} from "./listing";
import {
  buildDelegationServiceAggregationForId,
  readDelegationServiceOverview,
  readDelegationServiceWorkers,
} from "./reporting";
import type { DelegationServiceSupport } from "./support";

export function createDelegationServiceReadFacade(
  support: DelegationServiceSupport,
): DelegationServiceReadFacade {
  const read = () => support.read();
  const get = (id: string) => getDelegationTaskById(read, id);

  return {
    list: (filter) => listDelegationServiceTasks(read, filter),
    listByGroup: (group) => listDelegationServiceByGroup(read, group),
    listByLabel: (label) => listDelegationServiceByLabel(read, label),
    listByProfile: (profile) => listDelegationServiceByProfile(read, profile),
    get,
    pending: (filter) => pendingDelegationServiceTasks(read, filter),
    overview: () =>
      readDelegationServiceOverview(read, support.getActiveExecutions()),
    workers: (limit = 20, filter) =>
      readDelegationServiceWorkers(read, limit, filter),
    listChildren: (parentTaskId) =>
      listDelegationServiceChildren(read, parentTaskId),
    tree: (id) => buildDelegationServiceTreeById(id, read),
    aggregate: (id) =>
      buildDelegationServiceAggregationForId(read, id, (taskId) => get(taskId)),
  };
}
