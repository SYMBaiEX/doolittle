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
import type { TrajectoryServiceHosts } from "../service-support";
import type { TrajectoryServiceBundleArtifacts } from "../service-types";

export function exportTrajectoryServiceRecent(
  hosts: TrajectoryServiceHosts,
  limit = 100,
): string {
  return exportTrajectoryDataset(hosts.bundleStorage, { limit });
}

export function exportTrajectoryServiceDataset(
  hosts: TrajectoryServiceHosts,
  options: TrajectoryExportOptions = {},
): string {
  return exportTrajectoryDataset(hosts.bundleStorage, options);
}

export function exportTrajectoryServiceBundle(
  hosts: TrajectoryServiceHosts,
  limit = 100,
): TrajectoryServiceBundleArtifacts {
  return exportTrajectoryServiceFilteredBundle(hosts, { limit });
}

export function exportTrajectoryServiceLatest(
  hosts: TrajectoryServiceHosts,
): TrajectoryServiceBundleArtifacts {
  return exportTrajectoryServiceBundle(hosts, 100);
}

export function exportTrajectoryServiceFilteredBundle(
  hosts: TrajectoryServiceHosts,
  options: TrajectoryExportOptions = {},
): TrajectoryServiceBundleArtifacts {
  return exportTrajectoryBundleRecords(hosts.bundleStorage, options);
}

export function analyzeTrajectoryService(
  hosts: TrajectoryServiceHosts,
  options: TrajectoryExportOptions = {},
): TrajectoryAnalysisBundle {
  const bundle = exportTrajectoryServiceFilteredBundle(hosts, {
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
