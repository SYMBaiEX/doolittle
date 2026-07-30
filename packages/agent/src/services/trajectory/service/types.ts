import type {
  TrajectoryAnalysisBundle,
  TrajectoryBatchManifest,
  TrajectoryBenchmarkEnvironmentSummary,
  TrajectoryBenchmarkManifest,
  TrajectoryBenchmarkRun,
  TrajectoryBundleEntry,
  TrajectoryComparisonBundle,
  TrajectoryCompressionBundle,
  TrajectoryEvaluationBundle,
  TrajectoryEventInput,
  TrajectoryEventRecord,
  TrajectoryExportOptions,
  TrajectoryGatewayIngestBundle,
  TrajectoryReplayResult,
  TrajectoryResearchPackageBundle,
  TrajectoryRlDatasetOptions,
  TrajectoryRlReadyOptions,
} from "../../../types/trajectory";
import type {
  TrajectoryEvaluationServiceBatchManifestInput,
  TrajectoryEvaluationServiceBenchmarkManifestInput,
  TrajectoryEvaluationServiceBundleArtifacts,
  TrajectoryEvaluationServiceCompressBundleOptions,
  TrajectoryEvaluationServiceEvaluateBundleOptions,
  TrajectoryEvaluationServiceGatewayHistoryInput,
  TrajectoryEvaluationServiceRlDatasetArtifacts,
  TrajectoryEvaluationServiceRlReadyArtifacts,
} from "../service-types";

export interface TrajectoryEvaluationServiceApi {
  recordEvent(input: TrajectoryEventInput): TrajectoryEventRecord;
  recentEvents(
    limit?: number,
    filters?: TrajectoryExportOptions,
  ): TrajectoryEventRecord[];
  /** Debug/evaluation JSONL only. Use the ElizaOS SDK trajectory service for training exports. */
  exportRecent(limit?: number): string;
  /** Debug/evaluation JSONL only. Use the ElizaOS SDK trajectory service for training exports. */
  exportDataset(options?: TrajectoryExportOptions): string;
  /** Debug/evaluation bundle only. Manifests are marked trainingCompatible:false. */
  exportBundle(limit?: number): TrajectoryEvaluationServiceBundleArtifacts;
  /** Debug/evaluation bundle only. Manifests are marked trainingCompatible:false. */
  exportLatest(): TrajectoryEvaluationServiceBundleArtifacts;
  /** Debug/evaluation bundle only. Manifests are marked trainingCompatible:false. */
  exportFilteredBundle(
    options?: TrajectoryExportOptions,
  ): TrajectoryEvaluationServiceBundleArtifacts;
  analyze(options?: TrajectoryExportOptions): TrajectoryAnalysisBundle;
  evaluate(
    options?: TrajectoryExportOptions,
  ): Promise<TrajectoryEvaluationBundle>;
  evaluateBundle(
    manifestPath: string,
    options?: TrajectoryEvaluationServiceEvaluateBundleOptions,
  ): Promise<TrajectoryEvaluationBundle>;
  package(
    options?: TrajectoryExportOptions,
  ): Promise<TrajectoryResearchPackageBundle>;
  packageLatest(): Promise<TrajectoryResearchPackageBundle | undefined>;
  describeBenchmarkEnvironment(): TrajectoryBenchmarkEnvironmentSummary;
  createBenchmarkManifest(
    input: TrajectoryEvaluationServiceBenchmarkManifestInput,
  ): TrajectoryBenchmarkManifest;
  runBenchmark(manifestPath: string): Promise<TrajectoryBenchmarkRun>;
  runLatestBenchmark(): Promise<TrajectoryBenchmarkRun | undefined>;
  replayBundle(manifestPath: string): TrajectoryReplayResult;
  replayLatest(): TrajectoryReplayResult | undefined;
  compressBundle(
    manifestPath: string,
    options?: TrajectoryEvaluationServiceCompressBundleOptions,
  ): TrajectoryCompressionBundle;
  compressLatest(): TrajectoryCompressionBundle | undefined;
  compareBundles(
    leftManifestPath: string,
    rightManifestPath: string,
  ): TrajectoryComparisonBundle;
  compareLatest(): TrajectoryComparisonBundle | undefined;
  evaluateLatest(): Promise<TrajectoryEvaluationBundle | undefined>;
  ingestGatewayHistory(
    input: TrajectoryEvaluationServiceGatewayHistoryInput,
  ): TrajectoryGatewayIngestBundle;
  createBatchManifest(
    input: TrajectoryEvaluationServiceBatchManifestInput,
  ): TrajectoryBatchManifest;
  listBundles(limit?: number): TrajectoryBundleEntry[];
  describeBundle(manifestPath: string): TrajectoryBundleEntry;
  listBenchmarkManifests(limit?: number): TrajectoryBenchmarkManifest[];
  describeBenchmarkManifest(manifestPath: string): TrajectoryBenchmarkManifest;
  exportRlReady(
    sessionId: string,
    options?: TrajectoryRlReadyOptions,
  ): TrajectoryEvaluationServiceRlReadyArtifacts;
  exportRlDataset(
    options?: TrajectoryRlDatasetOptions,
  ): TrajectoryEvaluationServiceRlDatasetArtifacts;
  describeRlExport(): string;
}
