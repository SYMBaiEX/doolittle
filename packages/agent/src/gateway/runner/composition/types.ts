import type {
  GatewayDaemonState,
  GatewayRestartState,
} from "@/gateway/daemon-state";
import type { PlatformAdapter } from "@/gateway/platforms/base";
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
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type {
  GatewayRunnerControlPlane,
  GatewayRunnerControlPlaneDependencies,
} from "@/gateway/runner/control-plane";
import type {
  GatewayRunnerOperationDependencies,
  GatewayRunnerOperations,
} from "@/gateway/runner/operations";
import type {
  GatewayRunnerRecording,
  GatewayRunnerRecordingDeps,
} from "@/gateway/runner/recording";
import type { GatewayRunnerStateBookkeeping } from "@/gateway/runner/state";
import type { GatewayNativePluginInfo } from "@/gateway/state/platform-state";
import type {
  GatewayHistorySnapshot,
  GatewayNativeMessagingStateView,
  GatewayPlatformStateView,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { NativeTransportControlPlane } from "@/runtime/native/service-bridge/transport-control";
import type { PlatformName } from "@/types/gateway";

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
  recording: GatewayRunnerRecording;
  controlPlane: GatewayRunnerControlPlane;
  operations: GatewayRunnerOperations;
}

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
