import { getNativeTransportControlPlane } from "../../../runtime/native/service-bridge/transport-control/index";
import type { PlatformName } from "../../../types/gateway";
import type { PlatformLifecycleEvent } from "../../platforms/base";
import type {
  GatewayHistoryFilter,
  GatewayOutboxRecord,
} from "../../read/history-view/index";
import type { GatewayRuntimeStatus } from "../../read/read-model/index";
import type { GatewayHistorySnapshot } from "../../state/state-snapshot/index";
import { composeGatewayRunnerRuntime } from "../composition/compose";
import type {
  GatewayRunnerRuntimeAssembly,
  GatewayRunnerRuntimeAssemblyInput,
} from "../composition/types";
import type { GatewayRunnerContext } from "../context";
import { resolveNativeMessagingPlugin } from "../native-resolution";
import { createGatewayRunnerPlatformAccessors } from "../platform-accessors";
import type { GatewayRunnerRuntimeState } from "./state";

interface GatewayRunnerRuntimeDependencies {
  createGatewayRunnerPlatformAccessors: typeof createGatewayRunnerPlatformAccessors;
  resolveNativeMessagingPlugin: typeof resolveNativeMessagingPlugin;
  getNativeTransportControlPlane: typeof getNativeTransportControlPlane;
  composeGatewayRunnerRuntime: typeof composeGatewayRunnerRuntime;
}

interface GatewayRunnerRuntimeAssemblyOptions {
  context: GatewayRunnerContext;
  state: GatewayRunnerRuntimeState;
  createAdapter: GatewayRunnerRuntimeAssemblyInput["createAdapter"];
  runHeartbeat: GatewayRunnerRuntimeAssemblyInput["runHeartbeat"];
  runWatchdog: GatewayRunnerRuntimeAssemblyInput["runWatchdog"];
  observeAdapter: (
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ) => Promise<void>;
  snapshotState: (
    reason: string,
    limit?: number,
    filters?: GatewayHistoryFilter,
  ) => Promise<GatewayHistorySnapshot>;
  getRuntimeStatus: () => GatewayRuntimeStatus;
  dependencies?: Partial<GatewayRunnerRuntimeDependencies>;
}

const defaultDependencies: GatewayRunnerRuntimeDependencies = {
  createGatewayRunnerPlatformAccessors,
  resolveNativeMessagingPlugin,
  getNativeTransportControlPlane,
  composeGatewayRunnerRuntime,
};

export function assembleGatewayRunnerRuntime({
  context,
  state,
  createAdapter,
  runHeartbeat,
  runWatchdog,
  observeAdapter,
  snapshotState,
  getRuntimeStatus,
  dependencies,
}: GatewayRunnerRuntimeAssemblyOptions): GatewayRunnerRuntimeAssembly {
  const resolvedDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };
  const platformAccessors =
    resolvedDependencies.createGatewayRunnerPlatformAccessors(context);
  let outboxLog: GatewayOutboxRecord[] = [];

  const assembled = resolvedDependencies.composeGatewayRunnerRuntime({
    context,
    adapters: state.adapters,
    platformStates: state.platformStates,
    daemonState: state.daemonState,
    restartBackoffByPlatform: state.restartBackoffByPlatform,
    resolveNativeMessagingPlugin: (platform) =>
      resolvedDependencies.resolveNativeMessagingPlugin({
        config: context.config,
        gatewayConfig: context.services.gatewayConfig,
        runtime: context.runtime,
        platform,
      }),
    getConfiguredPlatforms: platformAccessors.getConfiguredPlatforms,
    isPlatformEnabled: platformAccessors.isPlatformEnabled,
    getTransportControlPlane: () =>
      resolvedDependencies.getNativeTransportControlPlane(
        context.runtime,
        context.config,
        context.services.gatewayConfig,
      ),
    isRunning: () => state.getRunning(),
    getWatchdogAt: () => state.getWatchdogAt(),
    getRuntimeMeta: () => state.getRuntimeMeta(),
    getNativeMessagingState: platformAccessors.getNativeMessagingState,
    setRunning: state.setRunning.bind(state),
    getStartedAt: state.getStartedAt.bind(state),
    setStartedAt: state.setStartedAt.bind(state),
    getStoppedAt: state.getStoppedAt.bind(state),
    setStoppedAt: state.setStoppedAt.bind(state),
    getLastHeartbeatAt: state.getLastHeartbeatAt.bind(state),
    setLastHeartbeatAt: state.setLastHeartbeatAt.bind(state),
    getHeartbeatInterval: state.getHeartbeatInterval.bind(state),
    setHeartbeatInterval: state.setHeartbeatInterval.bind(state),
    getSupervisionInterval: state.getSupervisionInterval.bind(state),
    setSupervisionInterval: state.setSupervisionInterval.bind(state),
    createAdapter,
    runHeartbeat,
    runWatchdog,
    observeAdapter,
    snapshotState,
    setLastSupervisionAt: state.setLastSupervisionAt.bind(state),
    getOutboxSessionIdByDeliveryId: (deliveryId) =>
      findOutboxSessionIdByDeliveryId(outboxLog, deliveryId),
    getRuntimeStatus,
  });

  outboxLog = assembled.outboxLog;
  return assembled;
}

function findOutboxSessionIdByDeliveryId(
  outboxLog: GatewayOutboxRecord[],
  deliveryId: string,
): string | undefined {
  return outboxLog
    .slice()
    .reverse()
    .find((record) => record.deliveryId === deliveryId)?.sessionId;
}
