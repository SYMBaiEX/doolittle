import type {
  TrajectoryAnalysisBundle,
  TrajectoryBenchmarkCaseInput,
  TrajectoryBenchmarkManifest,
  TrajectoryBundleEntry,
  TrajectoryComparisonBundle,
  TrajectoryEvaluationBundle,
  TrajectoryExportOptions,
  TrajectoryReplayResult,
} from "../../types/trajectory";
import type {
  TrajectoryBatchManifestInput,
  TrajectoryBundleMode,
  TrajectoryGatewayIngestInput,
} from "./bundle-storage/types";

export interface TrajectoryServiceBundleArtifacts {
  dataPath: string;
  manifestPath: string;
  summaryPath: string;
}

export interface TrajectoryServiceCompressBundleOptions {
  sampleCount?: number;
}

export interface TrajectoryServiceEvaluateBundleOptions {
  rubric?: string[];
  tags?: string[];
  replay?: TrajectoryReplayResult;
  prompt?: string;
  highlights?: string[];
  mode?: TrajectoryBundleMode;
  purpose?: string;
}

export interface TrajectoryServiceBenchmarkManifestInput {
  label?: string;
  purpose?: string;
  tags?: string[];
  rubric?: string[];
  group?: string;
  cases: TrajectoryBenchmarkCaseInput[];
}

export type TrajectoryServiceGatewayHistoryInput = TrajectoryGatewayIngestInput;

export type TrajectoryServiceBatchManifestInput = TrajectoryBatchManifestInput;

export interface TrajectoryServiceRlReadyArtifacts {
  dataPath: string;
  manifestPath: string;
  turnCount: number;
}

export interface TrajectoryServiceRlDatasetArtifacts {
  dataPath: string;
  manifestPath: string;
  turnCount: number;
  sessionCount: number;
}

export interface TrajectoryServiceCatalogBindings {
  listBundles(limit?: number): TrajectoryBundleEntry[];
  describeBundle(manifestPath: string): TrajectoryBundleEntry;
  listBenchmarkManifests(limit?: number): TrajectoryBenchmarkManifest[];
  describeBenchmarkManifest(manifestPath: string): TrajectoryBenchmarkManifest;
}

export interface TrajectoryServiceHostBindings
  extends TrajectoryServiceCatalogBindings {
  replayBundle(manifestPath: string): TrajectoryReplayResult;
  compareBundles(
    leftManifestPath: string,
    rightManifestPath: string,
  ): TrajectoryComparisonBundle;
  evaluateBundle(
    manifestPath: string,
    options?: TrajectoryServiceEvaluateBundleOptions,
  ): Promise<TrajectoryEvaluationBundle>;
  analyze(options?: TrajectoryExportOptions): TrajectoryAnalysisBundle;
}
