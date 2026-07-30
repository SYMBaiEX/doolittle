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
import type { TrajectoryEvaluationServiceHosts } from "../service-support";
import type { TrajectoryEvaluationServiceEvaluateBundleOptions } from "../service-types";

export async function evaluateTrajectoryEvaluationService(
  hosts: TrajectoryEvaluationServiceHosts,
  options: TrajectoryExportOptions = {},
): Promise<TrajectoryEvaluationBundle> {
  return evaluate(hosts.evaluation, options);
}

export async function evaluateTrajectoryEvaluationServiceBundle(
  hosts: TrajectoryEvaluationServiceHosts,
  manifestPath: string,
  options: TrajectoryEvaluationServiceEvaluateBundleOptions = {},
): Promise<TrajectoryEvaluationBundle> {
  return evaluateBundle(hosts.evaluation, manifestPath, options);
}

export async function packageTrajectoryEvaluationService(
  hosts: TrajectoryEvaluationServiceHosts,
  options: TrajectoryExportOptions = {},
): Promise<TrajectoryResearchPackageBundle> {
  return packageBundle(hosts.evaluation, options);
}

export function packageLatestTrajectoryEvaluationService(
  hosts: TrajectoryEvaluationServiceHosts,
): Promise<TrajectoryResearchPackageBundle | undefined> {
  return packageLatest(hosts.evaluation);
}

export async function evaluateLatestTrajectoryEvaluationServiceBundle(
  hosts: TrajectoryEvaluationServiceHosts,
): Promise<TrajectoryEvaluationBundle | undefined> {
  return evaluateLatestTrajectoryBundle(hosts);
}
