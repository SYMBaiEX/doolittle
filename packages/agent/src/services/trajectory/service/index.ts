import { mkdirSync } from "node:fs";
import type { TrajectoryModelContext } from "../../../types/trajectory";
import type { SessionService } from "../../session/service";
import { buildTrajectoryServiceHosts } from "../service-hosts";
import type { TrajectoryServiceHostBindings } from "../service-types";
import { trajectoryServiceBenchmarkMethods } from "./benchmark";
import { trajectoryServiceCatalogMethods } from "./catalog";
import { trajectoryServiceOperationMethods } from "./operations";
import { trajectoryServiceRlMethods } from "./rl";
import { setTrajectoryServiceState } from "./state";
import type { TrajectoryServiceApi } from "./types";

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
} from "../../../types/trajectory";

export class TrajectoryService implements TrajectoryServiceHostBindings {
  declare exportRecent: TrajectoryServiceApi["exportRecent"];
  declare exportDataset: TrajectoryServiceApi["exportDataset"];
  declare exportBundle: TrajectoryServiceApi["exportBundle"];
  declare exportLatest: TrajectoryServiceApi["exportLatest"];
  declare exportFilteredBundle: TrajectoryServiceApi["exportFilteredBundle"];
  declare analyze: TrajectoryServiceApi["analyze"];
  declare evaluate: TrajectoryServiceApi["evaluate"];
  declare evaluateBundle: TrajectoryServiceApi["evaluateBundle"];
  declare package: TrajectoryServiceApi["package"];
  declare packageLatest: TrajectoryServiceApi["packageLatest"];
  declare describeBenchmarkEnvironment: TrajectoryServiceApi["describeBenchmarkEnvironment"];
  declare createBenchmarkManifest: TrajectoryServiceApi["createBenchmarkManifest"];
  declare runBenchmark: TrajectoryServiceApi["runBenchmark"];
  declare runLatestBenchmark: TrajectoryServiceApi["runLatestBenchmark"];
  declare replayBundle: TrajectoryServiceApi["replayBundle"];
  declare replayLatest: TrajectoryServiceApi["replayLatest"];
  declare compressBundle: TrajectoryServiceApi["compressBundle"];
  declare compressLatest: TrajectoryServiceApi["compressLatest"];
  declare compareBundles: TrajectoryServiceApi["compareBundles"];
  declare compareLatest: TrajectoryServiceApi["compareLatest"];
  declare evaluateLatest: TrajectoryServiceApi["evaluateLatest"];
  declare ingestGatewayHistory: TrajectoryServiceApi["ingestGatewayHistory"];
  declare createBatchManifest: TrajectoryServiceApi["createBatchManifest"];
  declare listBundles: TrajectoryServiceApi["listBundles"];
  declare describeBundle: TrajectoryServiceApi["describeBundle"];
  declare listBenchmarkManifests: TrajectoryServiceApi["listBenchmarkManifests"];
  declare describeBenchmarkManifest: TrajectoryServiceApi["describeBenchmarkManifest"];
  declare exportRlReady: TrajectoryServiceApi["exportRlReady"];
  declare exportRlDataset: TrajectoryServiceApi["exportRlDataset"];
  declare describeRlExport: TrajectoryServiceApi["describeRlExport"];

  constructor(
    baseDir: string,
    sessions: SessionService,
    getModelContext?: () => TrajectoryModelContext,
  ) {
    mkdirSync(baseDir, { recursive: true });
    const hosts = buildTrajectoryServiceHosts({
      baseDir,
      sessions,
      getModelContext,
      bindings: this,
    });
    setTrajectoryServiceState(this, { baseDir, hosts });
  }
}

Object.assign(
  TrajectoryService.prototype,
  trajectoryServiceCatalogMethods,
  trajectoryServiceOperationMethods,
  trajectoryServiceBenchmarkMethods,
  trajectoryServiceRlMethods,
);
