import type {
  GatewayHistoryFilter,
  GatewayOutboxRecord,
} from "@/gateway/read/history-view";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import type {
  GatewayRunnerRuntimeAssembly,
  GatewayRunnerRuntimeAssemblyInput,
} from "@/gateway/runner/composition/types";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import { resolveNativeMessagingPlugin } from "@/gateway/runner/native-resolution";
import { createGatewayRunnerPlatformAccessors } from "@/gateway/runner/platform-accessors";
import type { GatewayHistorySnapshot } from "@/gateway/state/state-snapshot";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/transport-control";
import type { PlatformName } from "@/types/gateway";
import type { PlatformLifecycleEvent } from "../../platforms/base";
import { composeGatewayRunnerRuntime } from "../composition/compose";
import type { GatewayRunnerRuntimeState } from "./state";

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
}

export function assembleGatewayRunnerRuntime({
  context,
  state,
  createAdapter,
  runHeartbeat,
  runWatchdog,
  observeAdapter,
  snapshotState,
  getRuntimeStatus,
}: GatewayRunnerRuntimeAssemblyOptions): GatewayRunnerRuntimeAssembly {
  const platformAccessors = createGatewayRunnerPlatformAccessors(context);
  let outboxLog: GatewayOutboxRecord[] = [];

  const assembled = composeGatewayRunnerRuntime({
    context,
    adapters: state.adapters,
    platformStates: state.platformStates,
    daemonState: state.daemonState,
    restartBackoffByPlatform: state.restartBackoffByPlatform,
    resolveNativeMessagingPlugin: (platform) =>
      resolveNativeMessagingPlugin({
        config: context.config,
        gatewayConfig: context.services.gatewayConfig,
        runtime: context.runtime,
        platform,
      }),
    getConfiguredPlatforms: platformAccessors.getConfiguredPlatforms,
    isPlatformEnabled: platformAccessors.isPlatformEnabled,
    getTransportControlPlane: () =>
      getNativeTransportControlPlane(
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
