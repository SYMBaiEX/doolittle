import type { TrajectoryModelContext } from "../../types/trajectory";
import type { SessionService } from "../session/service";
import {
  createTrajectoryServiceSlug,
  readTrajectoryServiceRecords,
} from "./service-paths";
import {
  createTrajectoryServiceHosts,
  type TrajectoryServiceHosts,
} from "./service-support";
import type { TrajectoryServiceHostBindings } from "./service-types";

export interface TrajectoryServiceHostSource {
  baseDir: string;
  sessions: SessionService;
  getModelContext?: () => TrajectoryModelContext;
  bindings: TrajectoryServiceHostBindings;
}

export function buildTrajectoryServiceHosts(
  source: TrajectoryServiceHostSource,
): TrajectoryServiceHosts {
  const { bindings } = source;
  return createTrajectoryServiceHosts({
    baseDir: source.baseDir,
    sessions: source.sessions,
    getModelContext: source.getModelContext,
    slug: createTrajectoryServiceSlug,
    describeBundle: bindings.describeBundle.bind(bindings),
    replayBundle: bindings.replayBundle.bind(bindings),
    compareBundles: bindings.compareBundles.bind(bindings),
    evaluateBundle: bindings.evaluateBundle.bind(bindings),
    analyze: bindings.analyze.bind(bindings),
    readRecords: readTrajectoryServiceRecords,
    listBundles: bindings.listBundles.bind(bindings),
    listBenchmarkManifests: bindings.listBenchmarkManifests.bind(bindings),
    describeBenchmarkManifest:
      bindings.describeBenchmarkManifest.bind(bindings),
  });
}
