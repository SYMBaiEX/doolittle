import type { GatewayRunnerReadModelDeps, GatewayRuntimeStatus } from "./types";

type GatewayRuntimeStatusBuilderDeps = Pick<
  GatewayRunnerReadModelDeps,
  | "buildDaemonRuntimeState"
  | "getRuntimeMeta"
  | "getTransportControlPlane"
  | "supervisionLog"
>;

export function buildGatewayRuntimeStatus(
  deps: GatewayRuntimeStatusBuilderDeps,
): GatewayRuntimeStatus {
  const controlPlane = deps.getTransportControlPlane();
  const meta = deps.getRuntimeMeta();
  return {
    pid: meta.pid,
    running: meta.running,
    updatedAt: meta.updatedAt,
    startedAt: meta.startedAt,
    stoppedAt: meta.stoppedAt,
    lastHeartbeatAt: meta.lastHeartbeatAt,
    lastWatchdogAt: meta.lastWatchdogAt,
    lastSupervisionAt: meta.lastSupervisionAt,
    supervisionEvents: deps.supervisionLog.length,
    adapters: meta.adapterPlatforms,
    daemon: deps.buildDaemonRuntimeState(),
    journalPaths: meta.journalPaths,
    transportControl: controlPlane.totals,
    messagingBridge: controlPlane.messagingBridge,
    transportInventory: controlPlane.transportInventory,
  };
}
