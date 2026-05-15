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
  TrajectoryServiceBatchManifestInput,
  TrajectoryServiceBenchmarkManifestInput,
  TrajectoryServiceBundleArtifacts,
  TrajectoryServiceCompressBundleOptions,
  TrajectoryServiceEvaluateBundleOptions,
  TrajectoryServiceGatewayHistoryInput,
  TrajectoryServiceRlDatasetArtifacts,
  TrajectoryServiceRlReadyArtifacts,
} from "../service-types";

export interface TrajectoryServiceApi {
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
  exportBundle(limit?: number): TrajectoryServiceBundleArtifacts;
  /** Debug/evaluation bundle only. Manifests are marked trainingCompatible:false. */
  exportLatest(): TrajectoryServiceBundleArtifacts;
  /** Debug/evaluation bundle only. Manifests are marked trainingCompatible:false. */
  exportFilteredBundle(
    options?: TrajectoryExportOptions,
  ): TrajectoryServiceBundleArtifacts;
  analyze(options?: TrajectoryExportOptions): TrajectoryAnalysisBundle;
  evaluate(
    options?: TrajectoryExportOptions,
  ): Promise<TrajectoryEvaluationBundle>;
  evaluateBundle(
    manifestPath: string,
    options?: TrajectoryServiceEvaluateBundleOptions,
  ): Promise<TrajectoryEvaluationBundle>;
  package(
    options?: TrajectoryExportOptions,
  ): Promise<TrajectoryResearchPackageBundle>;
  packageLatest(): Promise<TrajectoryResearchPackageBundle | undefined>;
  describeBenchmarkEnvironment(): TrajectoryBenchmarkEnvironmentSummary;
  createBenchmarkManifest(
    input: TrajectoryServiceBenchmarkManifestInput,
  ): TrajectoryBenchmarkManifest;
  runBenchmark(manifestPath: string): Promise<TrajectoryBenchmarkRun>;
  runLatestBenchmark(): Promise<TrajectoryBenchmarkRun | undefined>;
  replayBundle(manifestPath: string): TrajectoryReplayResult;
  replayLatest(): TrajectoryReplayResult | undefined;
  compressBundle(
    manifestPath: string,
    options?: TrajectoryServiceCompressBundleOptions,
  ): TrajectoryCompressionBundle;
  compressLatest(): TrajectoryCompressionBundle | undefined;
  compareBundles(
    leftManifestPath: string,
    rightManifestPath: string,
  ): TrajectoryComparisonBundle;
  compareLatest(): TrajectoryComparisonBundle | undefined;
  evaluateLatest(): Promise<TrajectoryEvaluationBundle | undefined>;
  ingestGatewayHistory(
    input: TrajectoryServiceGatewayHistoryInput,
  ): TrajectoryGatewayIngestBundle;
  createBatchManifest(
    input: TrajectoryServiceBatchManifestInput,
  ): TrajectoryBatchManifest;
  listBundles(limit?: number): TrajectoryBundleEntry[];
  describeBundle(manifestPath: string): TrajectoryBundleEntry;
  listBenchmarkManifests(limit?: number): TrajectoryBenchmarkManifest[];
  describeBenchmarkManifest(manifestPath: string): TrajectoryBenchmarkManifest;
  exportRlReady(
    sessionId: string,
    options?: TrajectoryRlReadyOptions,
  ): TrajectoryServiceRlReadyArtifacts;
  exportRlDataset(
    options?: TrajectoryRlDatasetOptions,
  ): TrajectoryServiceRlDatasetArtifacts;
  describeRlExport(): string;
}
