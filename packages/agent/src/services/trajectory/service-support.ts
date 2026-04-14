import type {
  TrajectoryModelContext,
  TrajectoryRecord,
} from "../../types/trajectory";
import type { SessionService } from "../session/service";
import type { TrajectoryBenchmarkHost } from "./benchmark";
import type { TrajectoryBundleOperationsHost } from "./bundle-ops";
import type { TrajectoryBundleStorageHost } from "./bundle-storage";
import type { TrajectoryEvaluationHost } from "./evaluation";
import type { TrajectoryServiceRlExportHost } from "./rl-export-orchestration";
import type { TrajectoryServiceHostBindings } from "./service-types";

export interface TrajectoryServiceSupportSource
  extends TrajectoryServiceHostBindings {
  baseDir: string;
  sessions: Pick<SessionService, "recent" | "summary">;
  getModelContext?: () => TrajectoryModelContext;
  slug(value: string): string;
  readRecords(dataPath: string): TrajectoryRecord[];
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
