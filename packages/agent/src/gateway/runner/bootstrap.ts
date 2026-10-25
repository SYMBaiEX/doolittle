import type { NativeTransportControlPlane } from "../../runtime/native/service-bridge/transport-control/index";
import type {
  IncomingPlatformMessage,
  PlatformName,
} from "../../types/gateway";
import type { GatewayDaemonState, GatewayRestartState } from "../daemon-state";
import type { PlatformAdapter } from "../platforms/base";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../read/history-view/index";
import { GatewayRunnerReadModel } from "../read/read-model/index";
import type {
  GatewayReceiveOptions,
  GatewayReceiveResult,
} from "../receive/index";
import { persistGatewaySnapshotFiles } from "../recording/journal";
import type { GatewayNativePluginInfo } from "../state/platform-state";
import type {
  GatewayHistorySnapshot,
  GatewayNativeMessagingStateView,
  GatewayPlatformStateView,
} from "../state/state-snapshot/index";
import type { GatewaySupervisionRecord } from "../supervision/index";
import type { GatewayRunnerContext } from "./context";
import { initializeGatewayRunnerPersistence } from "./persistence";
import { GatewayRunnerStateBookkeeping } from "./state/index";

export interface GatewayRunnerRuntimeMeta {
  pid: number;
  running: boolean;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  lastWatchdogAt?: string;
  lastSupervisionAt?: string;
  adapterPlatforms: PlatformName[];
}

export interface GatewayRunnerBootstrapInputs {
  context: GatewayRunnerContext;
  adapters: ReadonlyMap<PlatformName, PlatformAdapter>;
  platformStates: Map<PlatformName, GatewayPlatformStateView>;
  daemonState: GatewayDaemonState;
  restartBackoffByPlatform: Map<PlatformName, GatewayRestartState>;
  resolveNativeMessagingPlugin: (
    platform: PlatformName,
  ) => GatewayNativePluginInfo | undefined;
  getConfiguredPlatforms: () => PlatformName[];
  isPlatformEnabled: (platform: PlatformName) => boolean;
  getTransportControlPlane: () => NativeTransportControlPlane;
  isRunning: () => boolean;
  getWatchdogAt: () => string | undefined;
  getRuntimeMeta: () => GatewayRunnerRuntimeMeta;
  getSnapshotStatePaths: () => {
    snapshotPath: string;
    historyPath: string;
  };
  receive: (
    message: IncomingPlatformMessage,
    options?: GatewayReceiveOptions,
  ) => Promise<GatewayReceiveResult>;
  getNativeMessagingState: (
    platform: PlatformName,
  ) => GatewayNativeMessagingStateView | undefined;
}

export interface GatewayRunnerBootstrapResult {
  snapshotPath: string;
  snapshotHistoryPath: string;
  runtimeStatusPath: string;
  supervisionPath: string;
  inboxPath: string;
  outboxPath: string;
  attachmentsPath: string;
  traceLog: GatewayTraceRecord[];
  inboxLog: GatewayInboxRecord[];
  outboxLog: GatewayOutboxRecord[];
  attachmentLog: GatewayAttachmentRecord[];
  supervisionLog: GatewaySupervisionRecord[];
  stateBookkeeping: GatewayRunnerStateBookkeeping;
  readModel: InstanceType<typeof GatewayRunnerReadModel>;
}

function persistSnapshotFile(
  snapshotPath: string,
  historyPath: string,
  snapshot: GatewayHistorySnapshot,
) {
  return persistGatewaySnapshotFiles({
    snapshotPath,
    historyPath,
    snapshot,
    historyEntry: {
      reason: snapshot.reason,
      state: snapshot.state,
      transportOverview: snapshot.transportOverview,
      transportSummaries: snapshot.transportSummaries,
    },
  });
}

export function bootstrapGatewayRunnerReadPlane(
  params: GatewayRunnerBootstrapInputs,
): GatewayRunnerBootstrapResult {
  const persistence = initializeGatewayRunnerPersistence(params.context);

  const stateBookkeeping = new GatewayRunnerStateBookkeeping({
    adapters: params.adapters,
    platformStates: params.platformStates,
    restartBackoffByPlatform: params.restartBackoffByPlatform,
    daemonState: params.daemonState,
    resolveNativeMessagingPlugin: params.resolveNativeMessagingPlugin,
    getConfiguredPlatforms: params.getConfiguredPlatforms,
    isPlatformEnabled: params.isPlatformEnabled,
    getTransportControlPlane: params.getTransportControlPlane,
    isRunning: params.isRunning,
    getSnapshotPaths: params.getSnapshotStatePaths,
    getWatchdogAt: params.getWatchdogAt,
    loadHistoryWindow: persistence.historyView.snapshotWindow.bind(
      persistence.historyView,
    ),
    persistSnapshot: async (_reason, snapshot) => {
      await persistSnapshotFile(
        params.getSnapshotStatePaths().snapshotPath,
        params.getSnapshotStatePaths().historyPath,
        snapshot,
      );
    },
  });

  const readModel = new GatewayRunnerReadModel({
    historyView: persistence.historyView,
    traceLog: persistence.traceLog,
    inboxLog: persistence.inboxLog,
    outboxLog: persistence.outboxLog,
    attachmentLog: persistence.attachmentLog,
    supervisionLog: persistence.supervisionLog,
    getTransportControlPlane: params.getTransportControlPlane,
    buildDaemonRuntimeState:
      stateBookkeeping.buildDaemonRuntimeState.bind(stateBookkeeping),
    getRuntimeMeta: () => {
      const meta = params.getRuntimeMeta();
      const runtimeMeta = {
        ...meta,
        journalPaths: {
          snapshot: persistence.snapshotPath,
          history: persistence.snapshotHistoryPath,
          runtime: persistence.runtimeStatusPath,
          supervision: persistence.supervisionPath,
          inbox: persistence.inboxPath,
          outbox: persistence.outboxPath,
          attachments: persistence.attachmentsPath,
        },
      };
      return runtimeMeta;
    },
    snapshotState: stateBookkeeping.snapshotState.bind(stateBookkeeping),
    getConfiguredPlatforms: params.getConfiguredPlatforms,
    getNativeMessagingState: params.getNativeMessagingState,
    receive: params.receive,
  });

  return {
    snapshotPath: persistence.snapshotPath,
    snapshotHistoryPath: persistence.snapshotHistoryPath,
    runtimeStatusPath: persistence.runtimeStatusPath,
    supervisionPath: persistence.supervisionPath,
    inboxPath: persistence.inboxPath,
    outboxPath: persistence.outboxPath,
    attachmentsPath: persistence.attachmentsPath,
    traceLog: persistence.traceLog,
    inboxLog: persistence.inboxLog,
    outboxLog: persistence.outboxLog,
    attachmentLog: persistence.attachmentLog,
    supervisionLog: persistence.supervisionLog,
    stateBookkeeping,
    readModel,
  };
}
