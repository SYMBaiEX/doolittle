import type {
  TrajectoryAnalysisBundle,
  TrajectoryBenchmarkManifest,
  TrajectoryBundleEntry,
  TrajectoryComparisonBundle,
  TrajectoryEvaluationBundle,
  TrajectoryExportOptions,
  TrajectoryModelContext,
  TrajectoryRecord,
  TrajectoryReplayResult,
} from "../../types/trajectory";
import type { SessionService } from "../session/service";
import type { TrajectoryBenchmarkHost } from "./benchmark";
import type { TrajectoryBundleOperationsHost } from "./bundle-ops";
import type { TrajectoryBundleStorageHost } from "./bundle-storage";
import type { TrajectoryEvaluationHost } from "./evaluation";
import type { TrajectoryServiceRlExportHost } from "./rl-export-orchestration";

export interface TrajectoryServiceSupportSource {
  baseDir: string;
  sessions: Pick<SessionService, "recent" | "summary">;
  getModelContext?: () => TrajectoryModelContext;
  slug(value: string): string;
  describeBundle(manifestPath: string): TrajectoryBundleEntry;
  replayBundle(manifestPath: string): TrajectoryReplayResult;
  compareBundles(
    leftManifestPath: string,
    rightManifestPath: string,
  ): TrajectoryComparisonBundle;
  evaluateBundle(
    manifestPath: string,
    options?: {
      rubric?: string[];
      tags?: string[];
      replay?: TrajectoryReplayResult;
      prompt?: string;
      highlights?: string[];
      mode?: "dataset" | "research" | "evaluation" | "rl";
      purpose?: string;
    },
  ): Promise<TrajectoryEvaluationBundle>;
  analyze(options?: TrajectoryExportOptions): TrajectoryAnalysisBundle;
  readRecords(dataPath: string): TrajectoryRecord[];
  listBundles(limit?: number): TrajectoryBundleEntry[];
  listBenchmarkManifests(limit?: number): TrajectoryBenchmarkManifest[];
  describeBenchmarkManifest(manifestPath: string): TrajectoryBenchmarkManifest;
}

export interface TrajectoryServiceHosts {
  evaluation: TrajectoryEvaluationHost;
  bundleStorage: TrajectoryBundleStorageHost;
  rlExport: TrajectoryServiceRlExportHost;
  bundleOperations: TrajectoryBundleOperationsHost;
  benchmark: TrajectoryBenchmarkHost;
}

export function createTrajectoryServiceHosts(
  source: TrajectoryServiceSupportSource,
): TrajectoryServiceHosts {
  const sharedSlug = source.slug.bind(source);
  return {
    evaluation: {
      baseDir: source.baseDir,
      slug: sharedSlug,
      describeBundle: source.describeBundle.bind(source),
      replayBundle: source.replayBundle.bind(source),
      listBundles: source.listBundles.bind(source),
      analyze: source.analyze.bind(source),
      getModelContext: source.getModelContext,
    },
    bundleStorage: {
      baseDir: source.baseDir,
      sessions: source.sessions,
      slug: sharedSlug,
    },
    rlExport: {
      baseDir: source.baseDir,
      sessions: source.sessions,
      slug: sharedSlug,
    },
    bundleOperations: {
      baseDir: source.baseDir,
      slug: sharedSlug,
      describeBundle: source.describeBundle.bind(source),
      readRecords: source.readRecords.bind(source),
      listBundles: source.listBundles.bind(source),
    },
    benchmark: {
      baseDir: source.baseDir,
      slug: sharedSlug,
      describeBundle: source.describeBundle.bind(source),
      listBundles: source.listBundles.bind(source),
      getModelContext: source.getModelContext,
      replayBundle: source.replayBundle.bind(source),
      compareBundles: source.compareBundles.bind(source),
      evaluateBundle: source.evaluateBundle.bind(source),
    },
  };
}
