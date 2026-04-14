import type {
  TrajectoryEvaluationBundle,
  TrajectoryExportOptions,
  TrajectoryResearchPackageBundle,
} from "../../../types/trajectory";
import {
  evaluate,
  evaluateBundle,
  packageBundle,
  packageLatest,
} from "../evaluation";
import { evaluateLatestTrajectoryBundle } from "../latest-ops";
import type { TrajectoryServiceHosts } from "../service-support";
import type { TrajectoryServiceEvaluateBundleOptions } from "../service-types";

export async function evaluateTrajectoryService(
  hosts: TrajectoryServiceHosts,
  options: TrajectoryExportOptions = {},
): Promise<TrajectoryEvaluationBundle> {
  return evaluate(hosts.evaluation, options);
}

export async function evaluateTrajectoryServiceBundle(
  hosts: TrajectoryServiceHosts,
  manifestPath: string,
  options: TrajectoryServiceEvaluateBundleOptions = {},
): Promise<TrajectoryEvaluationBundle> {
  return evaluateBundle(hosts.evaluation, manifestPath, options);
}

export async function packageTrajectoryService(
  hosts: TrajectoryServiceHosts,
  options: TrajectoryExportOptions = {},
): Promise<TrajectoryResearchPackageBundle> {
  return packageBundle(hosts.evaluation, options);
}

export function packageLatestTrajectoryService(
  hosts: TrajectoryServiceHosts,
): Promise<TrajectoryResearchPackageBundle | undefined> {
  return packageLatest(hosts.evaluation);
}

export async function evaluateLatestTrajectoryServiceBundle(
  hosts: TrajectoryServiceHosts,
): Promise<TrajectoryEvaluationBundle | undefined> {
  return evaluateLatestTrajectoryBundle(hosts);
}
