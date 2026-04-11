import type {
  GatewayDaemonState,
  GatewayRestartState,
} from "@/gateway/daemon-state";
import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
import type {
  GatewayRunnerReadModel,
  GatewayRuntimeStatus,
} from "@/gateway/read/read-model";
import type {
  GatewayRunnerBootstrapInputs,
  GatewayRunnerBootstrapResult,
  GatewayRunnerRuntimeMeta,
} from "@/gateway/runner/bootstrap";
import { bootstrapGatewayRunnerReadPlane } from "@/gateway/runner/bootstrap";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type {
  GatewayRunnerControlPlane,
  GatewayRunnerControlPlaneDependencies,
} from "@/gateway/runner/control-plane";
import { createGatewayRunnerControlPlane } from "@/gateway/runner/control-plane";
import {
  createGatewayRunnerOperations,
  type GatewayRunnerOperationDependencies,
  type GatewayRunnerOperations,
} from "@/gateway/runner/operations";
import type { GatewayRunnerReadSurface } from "@/gateway/runner/read-surface";
import type { GatewayRunnerRecordingDeps } from "@/gateway/runner/recording";
import { GatewayRunnerRecording } from "@/gateway/runner/recording";
import type { GatewayRunnerStateBookkeeping } from "@/gateway/runner/state";
import type { GatewayNativePluginInfo } from "@/gateway/state/platform-state";
import type {
  GatewayHistorySnapshot,
  GatewayNativeMessagingStateView,
  GatewayPlatformStateView,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { PlatformName } from "@/types/gateway";
import type { PlatformAdapter } from "../platforms/base";

export interface GatewayRunnerRuntimeAssembly {
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
  readModel: GatewayRunnerReadModel;
  readSurface: GatewayRunnerReadSurface;
  recording: GatewayRunnerRecording;
  controlPlane: GatewayRunnerControlPlane;
  operations: GatewayRunnerOperations;
}

type NativeTransportControlPlane = ReturnType<
  typeof import("@/runtime/native/service-bridge/index").getNativeTransportControlPlane
>;

export interface GatewayRunnerRuntimeAssemblyInput {
  context: GatewayRunnerContext;
  adapters: Map<PlatformName, PlatformAdapter>;
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
  getNativeMessagingState: (
    platform: PlatformName,
  ) => GatewayNativeMessagingStateView | undefined;
  setRunning: (value: boolean) => void;
  getStartedAt: () => string | undefined;
  setStartedAt: (value: string | undefined) => void;
  getStoppedAt: () => string | undefined;
  setStoppedAt: (value: string | undefined) => void;
  getLastHeartbeatAt: () => string | undefined;
  setLastHeartbeatAt: (value: string | undefined) => void;
  getHeartbeatInterval: () => ReturnType<typeof setInterval> | null;
  setHeartbeatInterval: (value: ReturnType<typeof setInterval> | null) => void;
  getSupervisionInterval: () => ReturnType<typeof setInterval> | null;
  setSupervisionInterval: (
    value: ReturnType<typeof setInterval> | null,
  ) => void;
  createAdapter: (platform: PlatformName) => PlatformAdapter;
  runHeartbeat: (reason?: string) => Promise<GatewayStateSnapshot>;
  runWatchdog: (reason?: string) => Promise<GatewaySupervisionRecord[]>;
  observeAdapter: (
    platform: PlatformName,
    event: Parameters<
      NonNullable<GatewayRunnerOperationDependencies["observeAdapter"]>
    >[1],
  ) => Promise<void>;
  snapshotState: (
    reason: string,
    limit?: number,
    filters?: GatewayHistoryFilter,
  ) => Promise<GatewayHistorySnapshot>;
  setLastSupervisionAt: (at: string) => void;
  getOutboxSessionIdByDeliveryId: (deliveryId: string) => string | undefined;
  getRuntimeStatus: () => GatewayRuntimeStatus;
}

export interface GatewayRunnerRuntimeAssemblyFactories {
  buildReadPlane?: (
    params: GatewayRunnerBootstrapInputs,
  ) => GatewayRunnerBootstrapResult;
  buildOperations?: (
    params: GatewayRunnerOperationDependencies,
  ) => GatewayRunnerOperations;
  buildControlPlane?: (
    params: GatewayRunnerControlPlaneDependencies,
  ) => GatewayRunnerControlPlane;
  buildRecording?: (deps: GatewayRunnerRecordingDeps) => GatewayRunnerRecording;
}

export function composeGatewayRunnerRuntime(
  input: GatewayRunnerRuntimeAssemblyInput &
    GatewayRunnerRuntimeAssemblyFactories,
): GatewayRunnerRuntimeAssembly {
  const {
    context,
    adapters,
    platformStates,
    daemonState,
    restartBackoffByPlatform,
    resolveNativeMessagingPlugin,
    getConfiguredPlatforms,
    isPlatformEnabled,
    getTransportControlPlane,
    isRunning,
    getWatchdogAt,
    getRuntimeMeta,
    getNativeMessagingState,
    setRunning,
    getStartedAt,
    setStartedAt,
    getStoppedAt,
    setStoppedAt,
    getLastHeartbeatAt,
    setLastHeartbeatAt,
    getHeartbeatInterval,
    setHeartbeatInterval,
    getSupervisionInterval,
    setSupervisionInterval,
    createAdapter,
    runHeartbeat,
    runWatchdog,
    observeAdapter,
    snapshotState,
    setLastSupervisionAt,
    getOutboxSessionIdByDeliveryId,
    getRuntimeStatus,
    buildReadPlane = bootstrapGatewayRunnerReadPlane,
    buildOperations = createGatewayRunnerOperations,
    buildControlPlane = createGatewayRunnerControlPlane,
    buildRecording = (deps) => new GatewayRunnerRecording(deps),
  } = input;

  let operationsDelegate: GatewayRunnerOperations | undefined;
  let snapshotPaths = {
    snapshotPath: "",
    historyPath: "",
  };

  const plane = buildReadPlane({
    context,
    adapters,
    platformStates,
    daemonState,
    restartBackoffByPlatform,
    resolveNativeMessagingPlugin,
    getConfiguredPlatforms,
    isPlatformEnabled,
    getTransportControlPlane,
    isRunning,
    getWatchdogAt,
    getRuntimeMeta,
    getSnapshotStatePaths: () => snapshotPaths,
    receive: async (message, options) => {
      if (!operationsDelegate) {
        throw new Error("Gateway runner operations are not initialized.");
      }
      return operationsDelegate.receive(message, options);
    },
    getNativeMessagingState,
  });

  snapshotPaths = {
    snapshotPath: plane.snapshotPath,
    historyPath: plane.snapshotHistoryPath,
  };

  const recording = buildRecording({
    traceLog: plane.traceLog,
    inboxLog: plane.inboxLog,
    outboxLog: plane.outboxLog,
    attachmentLog: plane.attachmentLog,
    supervisionLog: plane.supervisionLog,
    inboxPath: plane.inboxPath,
    outboxPath: plane.outboxPath,
    attachmentsPath: plane.attachmentsPath,
    runtimeStatusPath: plane.runtimeStatusPath,
    supervisionPath: plane.supervisionPath,
    ensurePlatformState: plane.stateBookkeeping.ensurePlatformState.bind(
      plane.stateBookkeeping,
    ),
    updatePlatformStateFromTrace:
      plane.stateBookkeeping.updatePlatformStateFromTrace.bind(
        plane.stateBookkeeping,
      ),
    getRuntimeStatus,
  });

  const operations = buildOperations({
    context,
    adapters,
    recording,
    snapshotState: (reason, limit?: number) =>
      snapshotState(reason, limit) as Promise<unknown>,
    observeAdapter,
    getOutboxSessionIdByDeliveryId,
  });
  operationsDelegate = operations;

  const controlPlane = buildControlPlane({
    lifecycle: {
      context,
      adapters,
      daemonState,
      getRunning: isRunning,
      setRunning,
      getStartedAt,
      setStartedAt,
      getStoppedAt,
      setStoppedAt,
      getLastHeartbeatAt,
      setLastHeartbeatAt,
      getHeartbeatInterval,
      setHeartbeatInterval,
      getSupervisionInterval,
      setSupervisionInterval,
      createAdapter,
      ensureRestartState: plane.stateBookkeeping.ensureRestartState.bind(
        plane.stateBookkeeping,
      ),
      syncPlatformStateFromHealth:
        plane.stateBookkeeping.syncPlatformStateFromHealth.bind(
          plane.stateBookkeeping,
        ),
      pushTrace: recording.pushTrace.bind(recording),
      observeAdapter,
      writeRuntimeStatus: recording.writeRuntimeStatus.bind(recording),
      snapshotState: (reason: string, limit: number) =>
        snapshotState(reason, limit),
      runHeartbeat,
      runWatchdog,
    },
    supervision: {
      adapters,
      daemonState,
      stateBookkeeping: {
        ensureRestartState: plane.stateBookkeeping.ensureRestartState.bind(
          plane.stateBookkeeping,
        ),
        ensurePlatformState: plane.stateBookkeeping.ensurePlatformState.bind(
          plane.stateBookkeeping,
        ),
      },
      recording: {
        recordSupervision: recording.recordSupervision.bind(recording),
        pushTrace: recording.pushTrace.bind(recording),
      },
      setLastSupervisionAt,
      observeAdapter,
      writeRuntimeStatus: recording.writeRuntimeStatus.bind(recording),
      snapshotState: (reason: string, limit?: number) =>
        snapshotState(reason, limit),
    },
  });

  return {
    snapshotPath: plane.snapshotPath,
    snapshotHistoryPath: plane.snapshotHistoryPath,
    runtimeStatusPath: plane.runtimeStatusPath,
    supervisionPath: plane.supervisionPath,
    inboxPath: plane.inboxPath,
    outboxPath: plane.outboxPath,
    attachmentsPath: plane.attachmentsPath,
    traceLog: plane.traceLog,
    inboxLog: plane.inboxLog,
    outboxLog: plane.outboxLog,
    attachmentLog: plane.attachmentLog,
    supervisionLog: plane.supervisionLog,
    stateBookkeeping: plane.stateBookkeeping,
    readModel: plane.readModel,
    readSurface: plane.readSurface,
    recording,
    controlPlane,
    operations,
  };
}
