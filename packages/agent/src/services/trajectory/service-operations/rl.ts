import type {
  TrajectoryRlDatasetOptions,
  TrajectoryRlReadyOptions,
} from "../../../types/trajectory";
import {
  describeTrajectoryEvaluationServiceRlExport as describeRlExport,
  exportTrajectoryEvaluationServiceRlDataset as exportRlDataset,
  exportTrajectoryEvaluationServiceRlReady as exportRlReady,
} from "../rl-export-orchestration";
import type { TrajectoryEvaluationServiceHosts } from "../service-support";
import type {
  TrajectoryEvaluationServiceRlDatasetArtifacts,
  TrajectoryEvaluationServiceRlReadyArtifacts,
} from "../service-types";

export function exportTrajectoryEvaluationServiceRlReady(
  hosts: TrajectoryEvaluationServiceHosts,
  sessionId: string,
  options: TrajectoryRlReadyOptions = {},
): TrajectoryEvaluationServiceRlReadyArtifacts {
  return exportRlReady(hosts.rlExport, sessionId, options);
}

export function exportTrajectoryEvaluationServiceRlDataset(
  hosts: TrajectoryEvaluationServiceHosts,
  options: TrajectoryRlDatasetOptions = {},
): TrajectoryEvaluationServiceRlDatasetArtifacts {
  return exportRlDataset(hosts.rlExport, options);
}

export function describeTrajectoryEvaluationServiceRlExport(
  hosts: TrajectoryEvaluationServiceHosts,
): string {
  return describeRlExport(hosts.rlExport);
}
