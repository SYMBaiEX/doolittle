import type { TrajectoryEvaluationService } from "../service";
import {
  compareLatestTrajectoryEvaluationServiceBundles,
  compareTrajectoryEvaluationServiceBundles,
  compressLatestTrajectoryEvaluationService,
  compressTrajectoryEvaluationServiceBundle,
  replayLatestTrajectoryEvaluationService,
  replayTrajectoryEvaluationServiceBundle,
} from "../service-operations/bundles";
import {
  evaluateLatestTrajectoryEvaluationServiceBundle,
  evaluateTrajectoryEvaluationService,
  evaluateTrajectoryEvaluationServiceBundle,
  packageLatestTrajectoryEvaluationService,
  packageTrajectoryEvaluationService,
} from "../service-operations/evaluation";
import {
  analyzeTrajectoryEvaluationService,
  exportTrajectoryEvaluationServiceBundle,
  exportTrajectoryEvaluationServiceDataset,
  exportTrajectoryEvaluationServiceFilteredBundle,
  exportTrajectoryEvaluationServiceLatest,
  exportTrajectoryEvaluationServiceRecent,
} from "../service-operations/exports";
import {
  createTrajectoryEvaluationServiceBatchManifest,
  ingestTrajectoryEvaluationServiceGatewayHistory,
} from "../service-operations/history";
import { getTrajectoryEvaluationServiceState } from "./state";
import type { TrajectoryEvaluationServiceApi } from "./types";

export const trajectoryServiceOperationMethods: Pick<
  TrajectoryEvaluationServiceApi,
  | "exportRecent"
  | "exportDataset"
  | "exportBundle"
  | "exportLatest"
  | "exportFilteredBundle"
  | "analyze"
  | "evaluate"
  | "evaluateBundle"
  | "package"
  | "packageLatest"
  | "replayBundle"
  | "replayLatest"
  | "compressBundle"
  | "compressLatest"
  | "compareBundles"
  | "compareLatest"
  | "evaluateLatest"
  | "ingestGatewayHistory"
  | "createBatchManifest"
> = {
  exportRecent(this: TrajectoryEvaluationService, limit = 100) {
    return exportTrajectoryEvaluationServiceRecent(
      getTrajectoryEvaluationServiceState(this).hosts,
      limit,
    );
  },

  exportDataset(this: TrajectoryEvaluationService, options = {}) {
    return exportTrajectoryEvaluationServiceDataset(
      getTrajectoryEvaluationServiceState(this).hosts,
      options,
    );
  },

  exportBundle(this: TrajectoryEvaluationService, limit = 100) {
    return exportTrajectoryEvaluationServiceBundle(
      getTrajectoryEvaluationServiceState(this).hosts,
      limit,
    );
  },

  exportLatest(this: TrajectoryEvaluationService) {
    return exportTrajectoryEvaluationServiceLatest(
      getTrajectoryEvaluationServiceState(this).hosts,
    );
  },

  exportFilteredBundle(this: TrajectoryEvaluationService, options = {}) {
    return exportTrajectoryEvaluationServiceFilteredBundle(
      getTrajectoryEvaluationServiceState(this).hosts,
      options,
    );
  },

  analyze(this: TrajectoryEvaluationService, options = {}) {
    return analyzeTrajectoryEvaluationService(
      getTrajectoryEvaluationServiceState(this).hosts,
      options,
    );
  },

  evaluate(this: TrajectoryEvaluationService, options = {}) {
    return evaluateTrajectoryEvaluationService(
      getTrajectoryEvaluationServiceState(this).hosts,
      options,
    );
  },

  evaluateBundle(
    this: TrajectoryEvaluationService,
    manifestPath: string,
    options = {},
  ) {
    return evaluateTrajectoryEvaluationServiceBundle(
      getTrajectoryEvaluationServiceState(this).hosts,
      manifestPath,
      options,
    );
  },

  package(this: TrajectoryEvaluationService, options = {}) {
    return packageTrajectoryEvaluationService(
      getTrajectoryEvaluationServiceState(this).hosts,
      options,
    );
  },

  packageLatest(this: TrajectoryEvaluationService) {
    return packageLatestTrajectoryEvaluationService(
      getTrajectoryEvaluationServiceState(this).hosts,
    );
  },

  replayBundle(this: TrajectoryEvaluationService, manifestPath: string) {
    return replayTrajectoryEvaluationServiceBundle(
      getTrajectoryEvaluationServiceState(this).hosts,
      manifestPath,
    );
  },

  replayLatest(this: TrajectoryEvaluationService) {
    return replayLatestTrajectoryEvaluationService(
      getTrajectoryEvaluationServiceState(this).hosts,
    );
  },

  compressBundle(
    this: TrajectoryEvaluationService,
    manifestPath: string,
    options = {},
  ) {
    return compressTrajectoryEvaluationServiceBundle(
      getTrajectoryEvaluationServiceState(this).hosts,
      manifestPath,
      options,
    );
  },

  compressLatest(this: TrajectoryEvaluationService) {
    return compressLatestTrajectoryEvaluationService(
      getTrajectoryEvaluationServiceState(this).hosts,
    );
  },

  compareBundles(
    this: TrajectoryEvaluationService,
    leftManifestPath: string,
    rightManifestPath: string,
  ) {
    return compareTrajectoryEvaluationServiceBundles(
      getTrajectoryEvaluationServiceState(this).hosts,
      leftManifestPath,
      rightManifestPath,
    );
  },

  compareLatest(this: TrajectoryEvaluationService) {
    return compareLatestTrajectoryEvaluationServiceBundles(
      getTrajectoryEvaluationServiceState(this).hosts,
    );
  },

  evaluateLatest(this: TrajectoryEvaluationService) {
    return evaluateLatestTrajectoryEvaluationServiceBundle(
      getTrajectoryEvaluationServiceState(this).hosts,
    );
  },

  ingestGatewayHistory(this: TrajectoryEvaluationService, input) {
    return ingestTrajectoryEvaluationServiceGatewayHistory(
      getTrajectoryEvaluationServiceState(this).hosts,
      input,
    );
  },

  createBatchManifest(this: TrajectoryEvaluationService, input) {
    return createTrajectoryEvaluationServiceBatchManifest(
      getTrajectoryEvaluationServiceState(this).hosts,
      input,
    );
  },
};
