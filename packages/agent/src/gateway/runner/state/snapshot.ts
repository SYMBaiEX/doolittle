import type { PlatformHealth } from "@/gateway/platforms/base";
import {
  buildGatewayStateSnapshot,
  type GatewayHistorySnapshot,
  type GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import { deriveGatewayRunnerHeartbeatAt } from "./projections";
import type {
  GatewayRunnerHistoryWindow,
  GatewayRunnerStateBookkeepingDeps,
} from "./types";

interface BuildGatewayRunnerStateSnapshotParams {
  deps: Pick<
    GatewayRunnerStateBookkeepingDeps,
    | "getSnapshotPaths"
    | "getTransportControlPlane"
    | "getWatchdogAt"
    | "isRunning"
    | "platformStates"
  >;
  reason: string;
  readiness: PlatformHealth[];
  daemon: ReturnType<
    typeof import("@/gateway/daemon-state").buildGatewayDaemonRuntimeState
  >;
  window: GatewayRunnerHistoryWindow;
}

export function buildGatewayRunnerStateSnapshot({
  deps,
  reason,
  readiness,
  daemon,
  window,
}: BuildGatewayRunnerStateSnapshotParams): GatewayStateSnapshot {
  const paths = deps.getSnapshotPaths();

  return buildGatewayStateSnapshot({
    running: deps.isRunning(),
    reason,
    snapshotPath: paths.snapshotPath,
    historyPath: paths.historyPath,
    daemon,
    controlPlane: deps.getTransportControlPlane(),
    readiness,
    platformStates: deps.platformStates,
    allTraces: window.allTraces,
    traces: window.traces,
    inbox: window.inbox,
    outbox: window.outbox,
    attachments: window.attachments,
    deliveries: window.deliveries,
    sessions: window.sessions,
    heartbeatAt: deriveGatewayRunnerHeartbeatAt(deps.platformStates),
    watchdogAt: deps.getWatchdogAt(),
  });
}

interface BuildGatewayRunnerHistorySnapshotParams {
  deps: Pick<GatewayRunnerStateBookkeepingDeps, "getSnapshotPaths">;
  reason: string;
  readiness: PlatformHealth[];
  window: GatewayRunnerHistoryWindow;
  state: GatewayStateSnapshot;
}

export function buildGatewayRunnerHistorySnapshot({
  deps,
  reason,
  readiness,
  window,
  state,
}: BuildGatewayRunnerHistorySnapshotParams): GatewayHistorySnapshot {
  const paths = deps.getSnapshotPaths();

  return {
    updatedAt: state.updatedAt,
    reason,
    snapshotPath: paths.snapshotPath,
    historyPath: paths.historyPath,
    readiness,
    transportOverview: state.transportOverview,
    transportSummaries: state.transportSummaries,
    transportJournal: state.transportJournal,
    traces: window.traces,
    inbox: window.inbox,
    outbox: window.outbox,
    attachments: window.attachments,
    deliveries: window.deliveries,
    sessions: window.sessions,
    state,
  };
}
