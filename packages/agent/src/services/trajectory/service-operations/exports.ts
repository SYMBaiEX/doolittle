import type {
  TrajectoryAnalysisBundle,
  TrajectoryExportOptions,
} from "../../../types/trajectory";
import { replayTrajectoryBundle } from "../bundle-ops";
import {
  exportTrajectoryBundleRecords,
  exportTrajectoryDataset,
} from "../bundle-storage";
import { buildAnalysisPrompt, buildHighlights } from "../evaluation";
import type { TrajectoryEvaluationServiceHosts } from "../service-support";
import type { TrajectoryEvaluationServiceBundleArtifacts } from "../service-types";

export function exportTrajectoryEvaluationServiceRecent(
  hosts: TrajectoryEvaluationServiceHosts,
  limit = 100,
): string {
  return exportTrajectoryDataset(hosts.bundleStorage, { limit });
}

export function exportTrajectoryEvaluationServiceDataset(
  hosts: TrajectoryEvaluationServiceHosts,
  options: TrajectoryExportOptions = {},
): string {
  return exportTrajectoryDataset(hosts.bundleStorage, options);
}

export function exportTrajectoryEvaluationServiceBundle(
  hosts: TrajectoryEvaluationServiceHosts,
  limit = 100,
): TrajectoryEvaluationServiceBundleArtifacts {
  return exportTrajectoryEvaluationServiceFilteredBundle(hosts, { limit });
}

export function exportTrajectoryEvaluationServiceLatest(
  hosts: TrajectoryEvaluationServiceHosts,
): TrajectoryEvaluationServiceBundleArtifacts {
  return exportTrajectoryEvaluationServiceBundle(hosts, 100);
}

export function exportTrajectoryEvaluationServiceFilteredBundle(
  hosts: TrajectoryEvaluationServiceHosts,
  options: TrajectoryExportOptions = {},
): TrajectoryEvaluationServiceBundleArtifacts {
  return exportTrajectoryBundleRecords(hosts.bundleStorage, options);
}

export function analyzeTrajectoryEvaluationService(
  hosts: TrajectoryEvaluationServiceHosts,
  options: TrajectoryExportOptions = {},
): TrajectoryAnalysisBundle {
  const bundle = exportTrajectoryEvaluationServiceFilteredBundle(hosts, {
    ...options,
    limit: options.limit ?? 200,
    mode: options.mode ?? "research",
    purpose: options.purpose ?? "trajectory research",
  });
  const replay = replayTrajectoryBundle(
    hosts.bundleOperations,
    bundle.manifestPath,
  );

  return {
    focus: "research",
    bundle: hosts.evaluation.describeBundle(bundle.manifestPath),
    replay,
    prompt: buildAnalysisPrompt(replay, options),
    highlights: buildHighlights(replay),
    purpose: options.purpose ?? "trajectory research",
    mode: options.mode ?? "research",
    tags: options.tags,
  };
}
