import {
  bootstrapGatewayRunnerReadPlane,
  type GatewayRunnerBootstrapResult,
} from "@/gateway/runner/bootstrap";
import {
  createGatewayRunnerOperationsDelegate,
  type GatewayRunnerOperationsDelegate,
} from "@/gateway/runner/composition/operations-delegate";
import type {
  GatewayRunnerRuntimeAssemblyFactories,
  GatewayRunnerRuntimeAssemblyInput,
} from "@/gateway/runner/composition/types";

interface GatewayRunnerReadPlaneAssembly {
  plane: GatewayRunnerBootstrapResult;
  operationsDelegate: GatewayRunnerOperationsDelegate;
}

export function assembleGatewayRunnerReadPlane(
  input: GatewayRunnerRuntimeAssemblyInput,
  buildReadPlane: NonNullable<
    GatewayRunnerRuntimeAssemblyFactories["buildReadPlane"]
  > = bootstrapGatewayRunnerReadPlane,
): GatewayRunnerReadPlaneAssembly {
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
  } = input;

  const operationsDelegate = createGatewayRunnerOperationsDelegate();
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
    receive: operationsDelegate.receive,
    getNativeMessagingState,
  });

  snapshotPaths = {
    snapshotPath: plane.snapshotPath,
    historyPath: plane.snapshotHistoryPath,
  };

  return {
    plane,
    operationsDelegate,
  };
}
