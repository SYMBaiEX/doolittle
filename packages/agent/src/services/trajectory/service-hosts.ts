import type { TrajectoryModelContext } from "../../types/trajectory";
import type { SessionService } from "../session/service";
import type { TrajectoryEventJournal } from "./event-journal";
import {
  createTrajectoryEvaluationServiceSlug,
  readTrajectoryEvaluationServiceRecords,
} from "./service-paths";
import {
  createTrajectoryEvaluationServiceHosts,
  type TrajectoryEvaluationServiceHosts,
} from "./service-support";
import type { TrajectoryEvaluationServiceHostBindings } from "./service-types";

export interface TrajectoryEvaluationServiceHostSource {
  baseDir: string;
  sessions: SessionService;
  getModelContext?: () => TrajectoryModelContext;
  eventJournal?: TrajectoryEventJournal;
  bindings: TrajectoryEvaluationServiceHostBindings;
}

export function buildTrajectoryEvaluationServiceHosts(
  source: TrajectoryEvaluationServiceHostSource,
): TrajectoryEvaluationServiceHosts {
  const { bindings } = source;
  return createTrajectoryEvaluationServiceHosts({
    baseDir: source.baseDir,
    sessions: source.sessions,
    getModelContext: source.getModelContext,
    eventJournal: source.eventJournal,
    slug: createTrajectoryEvaluationServiceSlug,
    describeBundle: bindings.describeBundle.bind(bindings),
    replayBundle: bindings.replayBundle.bind(bindings),
    compareBundles: bindings.compareBundles.bind(bindings),
    evaluateBundle: bindings.evaluateBundle.bind(bindings),
    analyze: bindings.analyze.bind(bindings),
    readRecords: readTrajectoryEvaluationServiceRecords,
    listBundles: bindings.listBundles.bind(bindings),
    listBenchmarkManifests: bindings.listBenchmarkManifests.bind(bindings),
    describeBenchmarkManifest:
      bindings.describeBenchmarkManifest.bind(bindings),
  });
}
