import { mkdirSync } from "node:fs";
import type {
  GatewayMessageLike,
  GatewayTraceLike,
  TrajectoryAnalysisBundle,
  TrajectoryBatchManifest,
  TrajectoryBenchmarkCaseInput,
  TrajectoryBenchmarkEnvironmentSummary,
  TrajectoryBenchmarkManifest,
  TrajectoryBenchmarkRun,
  TrajectoryBundleEntry,
  TrajectoryComparisonBundle,
  TrajectoryCompressionBundle,
  TrajectoryEvaluationBundle,
  TrajectoryExportOptions,
  TrajectoryGatewayIngestBundle,
  TrajectoryModelContext,
  TrajectoryReplayResult,
  TrajectoryResearchPackageBundle,
} from "../../types/trajectory";
import type { SessionService } from "../session/service";
import { runLatestTrajectoryBenchmark } from "./latest-benchmark";
import {
  describeTrajectoryServiceBenchmarkManifest,
  describeTrajectoryServiceBundle,
  listTrajectoryServiceBenchmarkManifests,
  listTrajectoryServiceBundles,
} from "./service-catalog";
import {
  analyzeTrajectoryService,
  compareLatestTrajectoryServiceBundles,
  compareTrajectoryServiceBundles,
  compressLatestTrajectoryService,
  compressTrajectoryServiceBundle,
  createTrajectoryServiceBatchManifest,
  createTrajectoryServiceBenchmarkManifest,
  describeTrajectoryServiceBenchmarkEnvironment,
  describeTrajectoryServiceRlExport,
  evaluateLatestTrajectoryServiceBundle,
  evaluateTrajectoryService,
  evaluateTrajectoryServiceBundle,
  exportTrajectoryServiceBundle,
  exportTrajectoryServiceDataset,
  exportTrajectoryServiceFilteredBundle,
  exportTrajectoryServiceLatest,
  exportTrajectoryServiceRecent,
  exportTrajectoryServiceRlDataset,
  exportTrajectoryServiceRlReady,
  ingestTrajectoryServiceGatewayHistory,
  packageLatestTrajectoryService,
  packageTrajectoryService,
  replayLatestTrajectoryService,
  replayTrajectoryServiceBundle,
  runTrajectoryServiceBenchmark,
} from "./service-operations";
import {
  createTrajectoryServiceSlug,
  readTrajectoryServiceRecords,
} from "./service-paths";
import {
  createTrajectoryServiceHosts,
  type TrajectoryServiceHosts,
} from "./service-support";

export type {
  GatewayMessageLike,
  GatewayTraceLike,
  TrajectoryAnalysisBundle,
  TrajectoryBatchManifest,
  TrajectoryBenchmarkCase,
  TrajectoryBenchmarkCaseResult,
  TrajectoryBenchmarkEnvironmentSummary,
  TrajectoryBenchmarkManifest,
  TrajectoryBenchmarkRun,
  TrajectoryBundleEntry,
  TrajectoryComparisonBundle,
  TrajectoryCompressionBundle,
  TrajectoryEvaluationBundle,
  TrajectoryExportOptions,
  TrajectoryGatewayIngestBundle,
  TrajectoryRecord,
  TrajectoryReplayResult,
  TrajectoryResearchPackageBundle,
} from "../../types/trajectory";

export class TrajectoryService {
  private readonly hosts: TrajectoryServiceHosts;

  constructor(
    private readonly baseDir: string,
    private readonly sessions: SessionService,
    private readonly getModelContext?: () => TrajectoryModelContext,
  ) {
    mkdirSync(baseDir, { recursive: true });
    this.hosts = createTrajectoryServiceHosts({
      baseDir: this.baseDir,
      sessions: this.sessions,
      getModelContext: this.getModelContext,
      slug: createTrajectoryServiceSlug,
      describeBundle: this.describeBundle.bind(this),
      replayBundle: this.replayBundle.bind(this),
      compareBundles: this.compareBundles.bind(this),
      evaluateBundle: this.evaluateBundle.bind(this),
      analyze: this.analyze.bind(this),
      readRecords: readTrajectoryServiceRecords,
      listBundles: this.listBundles.bind(this),
      listBenchmarkManifests: this.listBenchmarkManifests.bind(this),
      describeBenchmarkManifest: this.describeBenchmarkManifest.bind(this),
    });
  }

  exportRecent(limit = 100): string {
    return exportTrajectoryServiceRecent(this.hosts, limit);
  }

  exportDataset(options: TrajectoryExportOptions = {}): string {
    return exportTrajectoryServiceDataset(this.hosts, options);
  }

  exportBundle(limit = 100): {
    dataPath: string;
    manifestPath: string;
    summaryPath: string;
  } {
    return exportTrajectoryServiceBundle(this.hosts, limit);
  }

  exportLatest(): {
    dataPath: string;
    manifestPath: string;
    summaryPath: string;
  } {
    return exportTrajectoryServiceLatest(this.hosts);
  }

  exportFilteredBundle(options: TrajectoryExportOptions = {}): {
    dataPath: string;
    manifestPath: string;
    summaryPath: string;
  } {
    return exportTrajectoryServiceFilteredBundle(this.hosts, options);
  }

  analyze(options: TrajectoryExportOptions = {}): TrajectoryAnalysisBundle {
    return analyzeTrajectoryService(this.hosts, options);
  }

  async evaluate(
    options: TrajectoryExportOptions = {},
  ): Promise<TrajectoryEvaluationBundle> {
    return evaluateTrajectoryService(this.hosts, options);
  }

  async evaluateBundle(
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
    return evaluateTrajectoryServiceBundle(this.hosts, manifestPath, options);
  }

  async package(
    options: TrajectoryExportOptions = {},
  ): Promise<TrajectoryResearchPackageBundle> {
    return packageTrajectoryService(this.hosts, options);
  }

  packageLatest(): Promise<TrajectoryResearchPackageBundle | undefined> {
    return packageLatestTrajectoryService(this.hosts);
  }

  describeBenchmarkEnvironment(): TrajectoryBenchmarkEnvironmentSummary {
    return describeTrajectoryServiceBenchmarkEnvironment(this.hosts);
  }

  createBenchmarkManifest(input: {
    label?: string;
    purpose?: string;
    tags?: string[];
    rubric?: string[];
    group?: string;
    cases: TrajectoryBenchmarkCaseInput[];
  }): TrajectoryBenchmarkManifest {
    return createTrajectoryServiceBenchmarkManifest(this.hosts, input);
  }

  async runBenchmark(manifestPath: string): Promise<TrajectoryBenchmarkRun> {
    return runTrajectoryServiceBenchmark(this.hosts, manifestPath);
  }

  async runLatestBenchmark(): Promise<TrajectoryBenchmarkRun | undefined> {
    return runLatestTrajectoryBenchmark(
      this.hosts.benchmark,
      this.listBenchmarkManifests(20),
    );
  }

  replayBundle(manifestPath: string): TrajectoryReplayResult {
    return replayTrajectoryServiceBundle(this.hosts, manifestPath);
  }

  replayLatest(): TrajectoryReplayResult | undefined {
    return replayLatestTrajectoryService(this.hosts);
  }

  compressBundle(
    manifestPath: string,
    options: {
      sampleCount?: number;
    } = {},
  ): TrajectoryCompressionBundle {
    return compressTrajectoryServiceBundle(this.hosts, manifestPath, options);
  }

  compressLatest(): TrajectoryCompressionBundle | undefined {
    return compressLatestTrajectoryService(this.hosts);
  }

  compareBundles(
    leftManifestPath: string,
    rightManifestPath: string,
  ): TrajectoryComparisonBundle {
    return compareTrajectoryServiceBundles(
      this.hosts,
      leftManifestPath,
      rightManifestPath,
    );
  }

  compareLatest(): TrajectoryComparisonBundle | undefined {
    return compareLatestTrajectoryServiceBundles(this.hosts);
  }

  evaluateLatest(): Promise<TrajectoryEvaluationBundle | undefined> {
    return evaluateLatestTrajectoryServiceBundle(this.hosts);
  }

  ingestGatewayHistory(input: {
    label?: string;
    purpose?: string;
    tags?: string[];
    notes?: string;
    traces: GatewayTraceLike[];
    inbox: GatewayMessageLike[];
    outbox: GatewayMessageLike[];
  }): TrajectoryGatewayIngestBundle {
    return ingestTrajectoryServiceGatewayHistory(this.hosts, input);
  }

  createBatchManifest(input: {
    label?: string;
    purpose?: string;
    prompts: string[];
    rubric?: string[];
    tags?: string[];
    taskIds?: string[];
    group?: string;
  }): TrajectoryBatchManifest {
    return createTrajectoryServiceBatchManifest(this.hosts, input);
  }

  listBundles(limit = 20): TrajectoryBundleEntry[] {
    return listTrajectoryServiceBundles(this.baseDir, limit);
  }

  describeBundle(manifestPath: string): TrajectoryBundleEntry {
    return describeTrajectoryServiceBundle(manifestPath);
  }

  listBenchmarkManifests(limit = 20): TrajectoryBenchmarkManifest[] {
    return listTrajectoryServiceBenchmarkManifests(this.baseDir, limit);
  }

  describeBenchmarkManifest(manifestPath: string): TrajectoryBenchmarkManifest {
    return describeTrajectoryServiceBenchmarkManifest(manifestPath);
  }

  // -------------------------------------------------------------------------
  // RL-ready standardized exports (Doolittle training schema)
  // -------------------------------------------------------------------------

  /**
   * Export a session as an RL-ready JSONL file using a standardized schema
   * compatible with the Doolittle Agent trajectory format. Each line is a
   * `RlTurn` object containing the full conversation context up to that turn.
   *
   * Schema per line:
   * {
   *   "id": "<sessionId>:<turn_index>",
   *   "sessionId": string,
   *   "model": string,
   *   "provider": string,
   *   "agentName": string,
   *   "createdAt": string (ISO),
   *   "messages": [{"role": "user"|"assistant"|"system", "content": string}],
   *   "response": string,          // final assistant turn in this window
   *   "metadata": { ... }
   * }
   */
  exportRlReady(
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
    return exportTrajectoryServiceRlReady(this.hosts, sessionId, options);
  }

  /**
   * Export ALL sessions as a single RL-ready training dataset.
   * Groups by session, converts each to the windowed turn format,
   * and writes a combined JSONL file with a manifest.
   */
  exportRlDataset(
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
    return exportTrajectoryServiceRlDataset(this.hosts, options);
  }

  /**
   * Describe the RL export capabilities available.
   */
  describeRlExport(): string {
    return describeTrajectoryServiceRlExport(this.hosts);
  }
}
