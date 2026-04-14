import type {
  TrajectoryRlDatasetOptions,
  TrajectoryRlReadyOptions,
} from "../../../types/trajectory";
import {
  describeTrajectoryServiceRlExport as describeRlExport,
  exportTrajectoryServiceRlDataset as exportRlDataset,
  exportTrajectoryServiceRlReady as exportRlReady,
} from "../rl-export-orchestration";
import type { TrajectoryServiceHosts } from "../service-support";
import type {
  TrajectoryServiceRlDatasetArtifacts,
  TrajectoryServiceRlReadyArtifacts,
} from "../service-types";

export function exportTrajectoryServiceRlReady(
  hosts: TrajectoryServiceHosts,
  sessionId: string,
  options: TrajectoryRlReadyOptions = {},
): TrajectoryServiceRlReadyArtifacts {
  return exportRlReady(hosts.rlExport, sessionId, options);
}

export function exportTrajectoryServiceRlDataset(
  hosts: TrajectoryServiceHosts,
  options: TrajectoryRlDatasetOptions = {},
): TrajectoryServiceRlDatasetArtifacts {
  return exportRlDataset(hosts.rlExport, options);
}

export function describeTrajectoryServiceRlExport(
  hosts: TrajectoryServiceHosts,
): string {
  return describeRlExport(hosts.rlExport);
}
