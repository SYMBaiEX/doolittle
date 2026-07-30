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

export interface TrajectoryEvaluationServiceBundleArtifacts {
  dataPath: string;
  manifestPath: string;
  summaryPath: string;
  trainingCompatible?: boolean;
  trainingFormat?: "doolittle-debug";
  trainingNotes?: string;
}

export interface TrajectoryEvaluationServiceCompressBundleOptions {
  sampleCount?: number;
}

export interface TrajectoryEvaluationServiceEvaluateBundleOptions {
  rubric?: string[];
  tags?: string[];
  replay?: TrajectoryReplayResult;
  prompt?: string;
  highlights?: string[];
  mode?: TrajectoryBundleMode;
  purpose?: string;
}

export interface TrajectoryEvaluationServiceBenchmarkManifestInput {
  label?: string;
  purpose?: string;
  tags?: string[];
  rubric?: string[];
  group?: string;
  cases: TrajectoryBenchmarkCaseInput[];
}

export type TrajectoryEvaluationServiceGatewayHistoryInput =
  TrajectoryGatewayIngestInput;

export type TrajectoryEvaluationServiceBatchManifestInput =
  TrajectoryBatchManifestInput;

export interface TrajectoryEvaluationServiceRlReadyArtifacts {
  dataPath: string;
  manifestPath: string;
  turnCount: number;
  trainingCompatible?: boolean;
  trainingFormat?: "doolittle-rl-v1";
  trainingNotes?: string;
}

export interface TrajectoryEvaluationServiceRlDatasetArtifacts {
  dataPath: string;
  manifestPath: string;
  turnCount: number;
  sessionCount: number;
  trainingCompatible?: boolean;
  trainingFormat?: "doolittle-rl-v1";
  trainingNotes?: string;
}

export interface TrajectoryEvaluationServiceCatalogBindings {
  listBundles(limit?: number): TrajectoryBundleEntry[];
  describeBundle(manifestPath: string): TrajectoryBundleEntry;
  listBenchmarkManifests(limit?: number): TrajectoryBenchmarkManifest[];
  describeBenchmarkManifest(manifestPath: string): TrajectoryBenchmarkManifest;
}

export interface TrajectoryEvaluationServiceHostBindings
  extends TrajectoryEvaluationServiceCatalogBindings {
  replayBundle(manifestPath: string): TrajectoryReplayResult;
  compareBundles(
    leftManifestPath: string,
    rightManifestPath: string,
  ): TrajectoryComparisonBundle;
  evaluateBundle(
    manifestPath: string,
    options?: TrajectoryEvaluationServiceEvaluateBundleOptions,
  ): Promise<TrajectoryEvaluationBundle>;
  analyze(options?: TrajectoryExportOptions): TrajectoryAnalysisBundle;
}
