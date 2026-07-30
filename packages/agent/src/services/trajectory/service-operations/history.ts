import type {
  TrajectoryBatchManifest,
  TrajectoryGatewayIngestBundle,
} from "../../../types/trajectory";
import {
  createTrajectoryBatchManifest,
  ingestTrajectoryGatewayHistory,
} from "../bundle-storage";
import type { TrajectoryEvaluationServiceHosts } from "../service-support";
import type {
  TrajectoryEvaluationServiceBatchManifestInput,
  TrajectoryEvaluationServiceGatewayHistoryInput,
} from "../service-types";

export function ingestTrajectoryEvaluationServiceGatewayHistory(
  hosts: TrajectoryEvaluationServiceHosts,
  input: TrajectoryEvaluationServiceGatewayHistoryInput,
): TrajectoryGatewayIngestBundle {
  return ingestTrajectoryGatewayHistory(hosts.bundleStorage, input);
}

export function createTrajectoryEvaluationServiceBatchManifest(
  hosts: TrajectoryEvaluationServiceHosts,
  input: TrajectoryEvaluationServiceBatchManifestInput,
): TrajectoryBatchManifest {
  return createTrajectoryBatchManifest(hosts.bundleStorage, input);
}
