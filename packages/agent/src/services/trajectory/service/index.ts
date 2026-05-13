import { mkdirSync } from "node:fs";
import type {
  TrajectoryEventInput,
  TrajectoryModelContext,
} from "../../../types/trajectory";
import type {
  RunControllerService,
  RunUpdateEvent,
} from "../../run-controller-service";
import type { SessionService } from "../../session/service";
import { createTrajectoryEventJournal } from "../event-journal";
import { buildTrajectoryServiceHosts } from "../service-hosts";
import type { TrajectoryServiceHostBindings } from "../service-types";
import { trajectoryServiceBenchmarkMethods } from "./benchmark";
import { trajectoryServiceCatalogMethods } from "./catalog";
import { trajectoryServiceOperationMethods } from "./operations";
import { trajectoryServiceRecordingMethods } from "./recording";
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
  TrajectoryEventInput,
  TrajectoryEventRecord,
  TrajectoryExportOptions,
  TrajectoryGatewayIngestBundle,
  TrajectoryRecord,
  TrajectoryReplayResult,
  TrajectoryResearchPackageBundle,
} from "../../../types/trajectory";

export class TrajectoryService implements TrajectoryServiceHostBindings {
  declare recordEvent: TrajectoryServiceApi["recordEvent"];
  declare recentEvents: TrajectoryServiceApi["recentEvents"];
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
    runController?: Pick<RunControllerService, "onUpdate">,
  ) {
    mkdirSync(baseDir, { recursive: true });
    const eventJournal = createTrajectoryEventJournal(baseDir);
    const hosts = buildTrajectoryServiceHosts({
      baseDir,
      sessions,
      getModelContext,
      eventJournal,
      bindings: this,
    });
    setTrajectoryServiceState(this, { baseDir, hosts, eventJournal });
    runController?.onUpdate((event) => {
      eventJournal.append(runUpdateToTrajectoryEvent(event));
    });
  }
}

Object.assign(
  TrajectoryService.prototype,
  trajectoryServiceRecordingMethods,
  trajectoryServiceCatalogMethods,
  trajectoryServiceOperationMethods,
  trajectoryServiceBenchmarkMethods,
  trajectoryServiceRlMethods,
);

function runUpdateToTrajectoryEvent(
  event: RunUpdateEvent,
): TrajectoryEventInput {
  const run = event.run;
  const action = run.activeAction ?? run.lastAction;
  const stream = run.activeStream;
  const detail = run.statusDetail ?? run.errorMessage;
  return {
    category:
      event.type === "action-started" || event.type === "action-completed"
        ? "tool"
        : event.type === "local-mutation"
          ? "tool"
          : "run",
    event: `run.${event.type}`,
    sessionId: event.sessionId,
    runId: run.runId,
    roomId: run.roomId,
    source: run.source,
    text: [
      `[run:${event.type}]`,
      `status=${run.status}`,
      action ? `action=${action}` : undefined,
      stream ? `stream=${stream}` : undefined,
      detail ? `detail=${detail}` : undefined,
      `observedActions=${run.observedActionCount}`,
    ]
      .filter(Boolean)
      .join(" "),
    metadata: {
      type: event.type,
      run: {
        runId: run.runId,
        sessionId: run.sessionId,
        roomId: run.roomId,
        source: run.source,
        runDepth: run.runDepth,
        configuredMaxIterations: run.configuredMaxIterations,
        observedActionCount: run.observedActionCount,
        progressMode: run.progressMode,
        status: run.status,
        activeAction: run.activeAction,
        lastAction: run.lastAction,
        activeStream: run.activeStream,
        statusDetail: run.statusDetail,
        pendingApprovals: run.pendingApprovals,
        localMutations: run.localMutations,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        endedAt: run.endedAt,
        errorMessage: run.errorMessage,
      },
    },
  };
}
