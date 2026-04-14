import type {
  TrajectoryBatchManifest,
  TrajectoryGatewayIngestBundle,
} from "../../../types/trajectory";
import {
  createTrajectoryBatchManifest,
  ingestTrajectoryGatewayHistory,
} from "../bundle-storage";
import type { TrajectoryServiceHosts } from "../service-support";
import type {
  TrajectoryServiceBatchManifestInput,
  TrajectoryServiceGatewayHistoryInput,
} from "../service-types";

export function ingestTrajectoryServiceGatewayHistory(
  hosts: TrajectoryServiceHosts,
  input: TrajectoryServiceGatewayHistoryInput,
): TrajectoryGatewayIngestBundle {
  return ingestTrajectoryGatewayHistory(hosts.bundleStorage, input);
}

export function createTrajectoryServiceBatchManifest(
  hosts: TrajectoryServiceHosts,
  input: TrajectoryServiceBatchManifestInput,
): TrajectoryBatchManifest {
  return createTrajectoryBatchManifest(hosts.bundleStorage, input);
}
