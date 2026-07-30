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
import { buildTrajectoryEvaluationServiceHosts } from "../service-hosts";
import type { TrajectoryEvaluationServiceHostBindings } from "../service-types";
import { trajectoryServiceBenchmarkMethods } from "./benchmark";
import { trajectoryServiceCatalogMethods } from "./catalog";
import { trajectoryServiceOperationMethods } from "./operations";
import { trajectoryServiceRecordingMethods } from "./recording";
import { trajectoryServiceRlMethods } from "./rl";
import { setTrajectoryEvaluationServiceState } from "./state";
import type { TrajectoryEvaluationServiceApi } from "./types";

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

/**
 * Doolittle-owned replay, debugging, benchmarking, and evaluation projection.
 *
 * This service intentionally does not own canonical Eliza runtime trajectory
 * persistence. Training-compatible model and tool traces remain exclusively
 * owned by the SDK `trajectories` service.
 */
export class TrajectoryEvaluationService
  implements TrajectoryEvaluationServiceHostBindings
{
  declare recordEvent: TrajectoryEvaluationServiceApi["recordEvent"];
  declare recentEvents: TrajectoryEvaluationServiceApi["recentEvents"];
  declare exportRecent: TrajectoryEvaluationServiceApi["exportRecent"];
  declare exportDataset: TrajectoryEvaluationServiceApi["exportDataset"];
  declare exportBundle: TrajectoryEvaluationServiceApi["exportBundle"];
  declare exportLatest: TrajectoryEvaluationServiceApi["exportLatest"];
  declare exportFilteredBundle: TrajectoryEvaluationServiceApi["exportFilteredBundle"];
  declare analyze: TrajectoryEvaluationServiceApi["analyze"];
  declare evaluate: TrajectoryEvaluationServiceApi["evaluate"];
  declare evaluateBundle: TrajectoryEvaluationServiceApi["evaluateBundle"];
  declare package: TrajectoryEvaluationServiceApi["package"];
  declare packageLatest: TrajectoryEvaluationServiceApi["packageLatest"];
  declare describeBenchmarkEnvironment: TrajectoryEvaluationServiceApi["describeBenchmarkEnvironment"];
  declare createBenchmarkManifest: TrajectoryEvaluationServiceApi["createBenchmarkManifest"];
  declare runBenchmark: TrajectoryEvaluationServiceApi["runBenchmark"];
  declare runLatestBenchmark: TrajectoryEvaluationServiceApi["runLatestBenchmark"];
  declare replayBundle: TrajectoryEvaluationServiceApi["replayBundle"];
  declare replayLatest: TrajectoryEvaluationServiceApi["replayLatest"];
  declare compressBundle: TrajectoryEvaluationServiceApi["compressBundle"];
  declare compressLatest: TrajectoryEvaluationServiceApi["compressLatest"];
  declare compareBundles: TrajectoryEvaluationServiceApi["compareBundles"];
  declare compareLatest: TrajectoryEvaluationServiceApi["compareLatest"];
  declare evaluateLatest: TrajectoryEvaluationServiceApi["evaluateLatest"];
  declare ingestGatewayHistory: TrajectoryEvaluationServiceApi["ingestGatewayHistory"];
  declare createBatchManifest: TrajectoryEvaluationServiceApi["createBatchManifest"];
  declare listBundles: TrajectoryEvaluationServiceApi["listBundles"];
  declare describeBundle: TrajectoryEvaluationServiceApi["describeBundle"];
  declare listBenchmarkManifests: TrajectoryEvaluationServiceApi["listBenchmarkManifests"];
  declare describeBenchmarkManifest: TrajectoryEvaluationServiceApi["describeBenchmarkManifest"];
  declare exportRlReady: TrajectoryEvaluationServiceApi["exportRlReady"];
  declare exportRlDataset: TrajectoryEvaluationServiceApi["exportRlDataset"];
  declare describeRlExport: TrajectoryEvaluationServiceApi["describeRlExport"];

  constructor(
    baseDir: string,
    sessions: SessionService,
    getModelContext?: () => TrajectoryModelContext,
    runController?: Pick<RunControllerService, "onUpdate">,
  ) {
    mkdirSync(baseDir, { recursive: true });
    const eventJournal = createTrajectoryEventJournal(baseDir);
    const hosts = buildTrajectoryEvaluationServiceHosts({
      baseDir,
      sessions,
      getModelContext,
      eventJournal,
      bindings: this,
    });
    setTrajectoryEvaluationServiceState(this, { baseDir, hosts, eventJournal });
    runController?.onUpdate((event) => {
      eventJournal.append(runUpdateToTrajectoryEvent(event));
    });
  }
}

Object.assign(
  TrajectoryEvaluationService.prototype,
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
