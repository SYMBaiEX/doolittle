import type { TrajectoryService } from "../service";
import {
  compareLatestTrajectoryServiceBundles,
  compareTrajectoryServiceBundles,
  compressLatestTrajectoryService,
  compressTrajectoryServiceBundle,
  replayLatestTrajectoryService,
  replayTrajectoryServiceBundle,
} from "../service-operations/bundles";
import {
  evaluateLatestTrajectoryServiceBundle,
  evaluateTrajectoryService,
  evaluateTrajectoryServiceBundle,
  packageLatestTrajectoryService,
  packageTrajectoryService,
} from "../service-operations/evaluation";
import {
  analyzeTrajectoryService,
  exportTrajectoryServiceBundle,
  exportTrajectoryServiceDataset,
  exportTrajectoryServiceFilteredBundle,
  exportTrajectoryServiceLatest,
  exportTrajectoryServiceRecent,
} from "../service-operations/exports";
import {
  createTrajectoryServiceBatchManifest,
  ingestTrajectoryServiceGatewayHistory,
} from "../service-operations/history";
import { getTrajectoryServiceState } from "./state";
import type { TrajectoryServiceApi } from "./types";

export const trajectoryServiceOperationMethods: Pick<
  TrajectoryServiceApi,
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
  exportRecent(this: TrajectoryService, limit = 100) {
    return exportTrajectoryServiceRecent(
      getTrajectoryServiceState(this).hosts,
      limit,
    );
  },

  exportDataset(this: TrajectoryService, options = {}) {
    return exportTrajectoryServiceDataset(
      getTrajectoryServiceState(this).hosts,
      options,
    );
  },

  exportBundle(this: TrajectoryService, limit = 100) {
    return exportTrajectoryServiceBundle(
      getTrajectoryServiceState(this).hosts,
      limit,
    );
  },

  exportLatest(this: TrajectoryService) {
    return exportTrajectoryServiceLatest(getTrajectoryServiceState(this).hosts);
  },

  exportFilteredBundle(this: TrajectoryService, options = {}) {
    return exportTrajectoryServiceFilteredBundle(
      getTrajectoryServiceState(this).hosts,
      options,
    );
  },

  analyze(this: TrajectoryService, options = {}) {
    return analyzeTrajectoryService(
      getTrajectoryServiceState(this).hosts,
      options,
    );
  },

  evaluate(this: TrajectoryService, options = {}) {
    return evaluateTrajectoryService(
      getTrajectoryServiceState(this).hosts,
      options,
    );
  },

  evaluateBundle(this: TrajectoryService, manifestPath: string, options = {}) {
    return evaluateTrajectoryServiceBundle(
      getTrajectoryServiceState(this).hosts,
      manifestPath,
      options,
    );
  },

  package(this: TrajectoryService, options = {}) {
    return packageTrajectoryService(
      getTrajectoryServiceState(this).hosts,
      options,
    );
  },

  packageLatest(this: TrajectoryService) {
    return packageLatestTrajectoryService(
      getTrajectoryServiceState(this).hosts,
    );
  },

  replayBundle(this: TrajectoryService, manifestPath: string) {
    return replayTrajectoryServiceBundle(
      getTrajectoryServiceState(this).hosts,
      manifestPath,
    );
  },

  replayLatest(this: TrajectoryService) {
    return replayLatestTrajectoryService(getTrajectoryServiceState(this).hosts);
  },

  compressBundle(this: TrajectoryService, manifestPath: string, options = {}) {
    return compressTrajectoryServiceBundle(
      getTrajectoryServiceState(this).hosts,
      manifestPath,
      options,
    );
  },

  compressLatest(this: TrajectoryService) {
    return compressLatestTrajectoryService(
      getTrajectoryServiceState(this).hosts,
    );
  },

  compareBundles(
    this: TrajectoryService,
    leftManifestPath: string,
    rightManifestPath: string,
  ) {
    return compareTrajectoryServiceBundles(
      getTrajectoryServiceState(this).hosts,
      leftManifestPath,
      rightManifestPath,
    );
  },

  compareLatest(this: TrajectoryService) {
    return compareLatestTrajectoryServiceBundles(
      getTrajectoryServiceState(this).hosts,
    );
  },

  evaluateLatest(this: TrajectoryService) {
    return evaluateLatestTrajectoryServiceBundle(
      getTrajectoryServiceState(this).hosts,
    );
  },

  ingestGatewayHistory(this: TrajectoryService, input) {
    return ingestTrajectoryServiceGatewayHistory(
      getTrajectoryServiceState(this).hosts,
      input,
    );
  },

  createBatchManifest(this: TrajectoryService, input) {
    return createTrajectoryServiceBatchManifest(
      getTrajectoryServiceState(this).hosts,
      input,
    );
  },
};
