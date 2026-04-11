import type {
  GatewayMessageLike,
  GatewayTraceLike,
  TrajectoryAnalysisBundle,
  TrajectoryBatchManifest,
  TrajectoryBenchmarkCaseInput,
  TrajectoryBenchmarkEnvironmentSummary,
  TrajectoryBenchmarkManifest,
  TrajectoryBenchmarkRun,
  TrajectoryComparisonBundle,
  TrajectoryCompressionBundle,
  TrajectoryEvaluationBundle,
  TrajectoryExportOptions,
  TrajectoryGatewayIngestBundle,
  TrajectoryReplayResult,
  TrajectoryResearchPackageBundle,
} from "../../types/trajectory";
import {
  createTrajectoryBenchmarkManifest as createBenchmarkManifest,
  describeTrajectoryBenchmarkEnvironment as describeBenchmarkEnvironment,
  runTrajectoryBenchmark as runBenchmark,
} from "./benchmark";
import {
  compareTrajectoryBundles,
  compressTrajectoryBundle,
  replayTrajectoryBundle,
} from "./bundle-ops";
import {
  createTrajectoryBatchManifest,
  exportTrajectoryBundleRecords,
  exportTrajectoryDataset,
  ingestTrajectoryGatewayHistory,
} from "./bundle-storage";
import {
  buildAnalysisPrompt,
  buildHighlights,
  evaluate,
  evaluateBundle,
  packageBundle,
  packageLatest,
} from "./evaluation";
import {
  compareLatestTrajectoryBundles,
  compressLatestTrajectoryBundle,
  evaluateLatestTrajectoryBundle,
  replayLatestTrajectoryBundle,
  runLatestTrajectoryBenchmark,
} from "./latest-ops";
import {
  describeTrajectoryServiceRlExport as describeRlExport,
  exportTrajectoryServiceRlDataset as exportRlDataset,
  exportTrajectoryServiceRlReady as exportRlReady,
} from "./rl-export-orchestration";
import type { TrajectoryServiceHosts } from "./service-support";

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
): {
  dataPath: string;
  manifestPath: string;
  summaryPath: string;
} {
  return exportTrajectoryServiceFilteredBundle(hosts, { limit });
}

export function exportTrajectoryServiceLatest(hosts: TrajectoryServiceHosts): {
  dataPath: string;
  manifestPath: string;
  summaryPath: string;
} {
  return exportTrajectoryServiceBundle(hosts, 100);
}

export function exportTrajectoryServiceFilteredBundle(
  hosts: TrajectoryServiceHosts,
  options: TrajectoryExportOptions = {},
): {
  dataPath: string;
  manifestPath: string;
  summaryPath: string;
} {
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
  const prompt = buildAnalysisPrompt(replay, options);
  const highlights = buildHighlights(replay);

  return {
    focus: "research",
    bundle: hosts.evaluation.describeBundle(bundle.manifestPath),
    replay,
    prompt,
    highlights,
    purpose: options.purpose ?? "trajectory research",
    mode: options.mode ?? "research",
    tags: options.tags,
  };
}

export async function evaluateTrajectoryService(
  hosts: TrajectoryServiceHosts,
  options: TrajectoryExportOptions = {},
): Promise<TrajectoryEvaluationBundle> {
  return evaluate(hosts.evaluation, options);
}

export async function evaluateTrajectoryServiceBundle(
  hosts: TrajectoryServiceHosts,
  manifestPath: string,
  options: {
    rubric?: string[];
    tags?: string[];
    replay?: TrajectoryReplayResult;
    prompt?: string;
    highlights?: string[];
    mode?: "dataset" | "research" | "evaluation" | "rl";
    purpose?: string;
  } = {},
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

export function describeTrajectoryServiceBenchmarkEnvironment(
  hosts: TrajectoryServiceHosts,
): TrajectoryBenchmarkEnvironmentSummary {
  return describeBenchmarkEnvironment(hosts.benchmark);
}

export function createTrajectoryServiceBenchmarkManifest(
  hosts: TrajectoryServiceHosts,
  input: {
    label?: string;
    purpose?: string;
    tags?: string[];
    rubric?: string[];
    group?: string;
    cases: TrajectoryBenchmarkCaseInput[];
  },
): TrajectoryBenchmarkManifest {
  return createBenchmarkManifest(hosts.benchmark, input);
}

export async function runTrajectoryServiceBenchmark(
  hosts: TrajectoryServiceHosts,
  manifestPath: string,
): Promise<TrajectoryBenchmarkRun> {
  return runBenchmark(hosts.benchmark, manifestPath);
}

export async function runLatestTrajectoryServiceBenchmark(
  hosts: TrajectoryServiceHosts,
): Promise<TrajectoryBenchmarkRun | undefined> {
  return runLatestTrajectoryBenchmark(hosts);
}

export function replayTrajectoryServiceBundle(
  hosts: TrajectoryServiceHosts,
  manifestPath: string,
): TrajectoryReplayResult {
  return replayTrajectoryBundle(hosts.bundleOperations, manifestPath);
}

export function replayLatestTrajectoryService(
  hosts: TrajectoryServiceHosts,
): TrajectoryReplayResult | undefined {
  return replayLatestTrajectoryBundle(hosts);
}

export function compressTrajectoryServiceBundle(
  hosts: TrajectoryServiceHosts,
  manifestPath: string,
  options: {
    sampleCount?: number;
  } = {},
): TrajectoryCompressionBundle {
  return compressTrajectoryBundle(
    hosts.bundleOperations,
    manifestPath,
    options,
  );
}

export function compressLatestTrajectoryService(
  hosts: TrajectoryServiceHosts,
): TrajectoryCompressionBundle | undefined {
  return compressLatestTrajectoryBundle(hosts);
}

export function compareTrajectoryServiceBundles(
  hosts: TrajectoryServiceHosts,
  leftManifestPath: string,
  rightManifestPath: string,
): TrajectoryComparisonBundle {
  return compareTrajectoryBundles(
    hosts.bundleOperations,
    leftManifestPath,
    rightManifestPath,
  );
}

export function compareLatestTrajectoryServiceBundles(
  hosts: TrajectoryServiceHosts,
): TrajectoryComparisonBundle | undefined {
  return compareLatestTrajectoryBundles(hosts);
}

export async function evaluateLatestTrajectoryServiceBundle(
  hosts: TrajectoryServiceHosts,
): Promise<TrajectoryEvaluationBundle | undefined> {
  return evaluateLatestTrajectoryBundle(hosts);
}

export function ingestTrajectoryServiceGatewayHistory(
  hosts: TrajectoryServiceHosts,
  input: {
    label?: string;
    purpose?: string;
    tags?: string[];
    notes?: string;
    traces: GatewayTraceLike[];
    inbox: GatewayMessageLike[];
    outbox: GatewayMessageLike[];
  },
): TrajectoryGatewayIngestBundle {
  return ingestTrajectoryGatewayHistory(hosts.bundleStorage, input);
}

export function createTrajectoryServiceBatchManifest(
  hosts: TrajectoryServiceHosts,
  input: {
    label?: string;
    purpose?: string;
    prompts: string[];
    rubric?: string[];
    tags?: string[];
    taskIds?: string[];
    group?: string;
  },
): TrajectoryBatchManifest {
  return createTrajectoryBatchManifest(hosts.bundleStorage, input);
}

export function exportTrajectoryServiceRlReady(
  hosts: TrajectoryServiceHosts,
  sessionId: string,
  options: {
    label?: string;
    model?: string;
    provider?: string;
    agentName?: string;
    windowSize?: number;
    includeMetadata?: boolean;
  } = {},
): { dataPath: string; manifestPath: string; turnCount: number } {
  return exportRlReady(hosts.rlExport, sessionId, options);
}

export function exportTrajectoryServiceRlDataset(
  hosts: TrajectoryServiceHosts,
  options: {
    label?: string;
    model?: string;
    provider?: string;
    agentName?: string;
    windowSize?: number;
    limit?: number;
  } = {},
): {
  dataPath: string;
  manifestPath: string;
  turnCount: number;
  sessionCount: number;
} {
  return exportRlDataset(hosts.rlExport, options);
}

export function describeTrajectoryServiceRlExport(
  hosts: TrajectoryServiceHosts,
): string {
  return describeRlExport(hosts.rlExport);
}
