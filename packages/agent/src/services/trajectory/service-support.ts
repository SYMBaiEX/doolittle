import type {
  TrajectoryEventRecord,
  TrajectoryFilters,
  TrajectoryModelContext,
  TrajectoryRecord,
} from "../../types/trajectory";
import type { SessionService } from "../session/service";
import type { TrajectoryBenchmarkHost } from "./benchmark";
import type { TrajectoryBundleOperationsHost } from "./bundle-ops";
import type { TrajectoryBundleStorageHost } from "./bundle-storage";
import type { TrajectoryEvaluationHost } from "./evaluation";
import type { TrajectoryEvaluationServiceRlExportHost } from "./rl-export-orchestration";
import type { TrajectoryEvaluationServiceHostBindings } from "./service-types";

export interface TrajectoryEvaluationServiceSupportSource
  extends TrajectoryEvaluationServiceHostBindings {
  baseDir: string;
  sessions: Pick<SessionService, "recent" | "summary">;
  getModelContext?: () => TrajectoryModelContext;
  eventJournal?: {
    recent(limit: number, filters?: TrajectoryFilters): TrajectoryEventRecord[];
  };
  slug(value: string): string;
  readRecords(dataPath: string): TrajectoryRecord[];
}

export interface TrajectoryEvaluationServiceHosts {
  evaluation: TrajectoryEvaluationHost;
  bundleStorage: TrajectoryBundleStorageHost;
  rlExport: TrajectoryEvaluationServiceRlExportHost;
  bundleOperations: TrajectoryBundleOperationsHost;
  benchmark: TrajectoryBenchmarkHost;
}

export function createTrajectoryEvaluationServiceHosts(
  source: TrajectoryEvaluationServiceSupportSource,
): TrajectoryEvaluationServiceHosts {
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
      eventJournal: source.eventJournal,
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
