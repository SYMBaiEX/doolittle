import type {
  GatewayDaemonState,
  GatewayRestartState,
} from "@/gateway/daemon-state";
import type { GatewayTraceRecord } from "@/gateway/read/history-view";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import {
  createGatewayRunnerLifecycleHost,
  createGatewayRunnerSupervisionDeps,
} from "@/gateway/runner/factories";
import type { GatewayRunnerLifecycleHost } from "@/gateway/runner/lifecycle/types";
import type {
  GatewayHistorySnapshot,
  GatewayPlatformStateView,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type {
  GatewaySupervisionAction,
  GatewaySupervisionDependencies,
  GatewaySupervisionRecord,
} from "@/gateway/supervision/index";
import type { PlatformName } from "@/types/gateway";
import type {
  PlatformAdapter,
  PlatformHealth,
  PlatformLifecycleEvent,
} from "../platforms/base";

export interface GatewayRunnerLifecycleHostInputs {
  context: GatewayRunnerContext;
  adapters: Map<PlatformName, PlatformAdapter>;
  daemonState: GatewayDaemonState;
  getRunning: () => boolean;
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
  ensureRestartState: (platform: PlatformName) => void;
  syncPlatformStateFromHealth: (health: PlatformHealth) => void;
  pushTrace: (entry: {
    traceId: string;
    at: string;
    kind: "lifecycle" | "heartbeat";
    platform: PlatformName | "gateway";
    detail: string;
  }) => void;
  observeAdapter: (
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ) => Promise<void>;
  writeRuntimeStatus: () => void;
  snapshotState: (
    reason: string,
    limit: number,
  ) => Promise<GatewayHistorySnapshot>;
  runHeartbeat: (reason: string) => Promise<GatewayStateSnapshot>;
  runWatchdog: (reason: string) => Promise<GatewaySupervisionRecord[]>;
}

export interface GatewayRunnerSupervisionHostInputs {
  adapters: Map<PlatformName, PlatformAdapter>;
  daemonState: GatewayDaemonState;
  stateBookkeeping: {
    ensureRestartState(platform: PlatformName): GatewayRestartState;
    ensurePlatformState(platform: PlatformName): GatewayPlatformStateView;
  };
  recording: {
    recordSupervision: (
      platform: PlatformName | "gateway",
      action: GatewaySupervisionAction,
      detail: string,
      delayMs?: number,
      attempt?: number,
    ) => GatewaySupervisionRecord;
    pushTrace: (entry: GatewayTraceRecord) => void;
  };
  setLastSupervisionAt: (at: string) => void;
  observeAdapter: (
    platform: PlatformName,
    event: {
      at: string;
      kind:
        | "start"
        | "stop"
        | "heartbeat"
        | "receive"
        | "authorize"
        | "route"
        | "respond"
        | "deliver"
        | "reject"
        | "edit";
      detail: string;
    },
  ) => Promise<void>;
  writeRuntimeStatus: () => void;
  snapshotState: (
    reason: string,
    limit?: number,
  ) => Promise<GatewayHistorySnapshot>;
}

export function buildGatewayRunnerLifecycleHost(
  params: GatewayRunnerLifecycleHostInputs,
): GatewayRunnerLifecycleHost {
  const host = createGatewayRunnerLifecycleHost({
    context: params.context,
    adapters: params.adapters,
    daemonState: params.daemonState,
    getRunning: params.getRunning,
    setRunning: params.setRunning,
    getStartedAt: params.getStartedAt,
    setStartedAt: params.setStartedAt,
    getStoppedAt: params.getStoppedAt,
    setStoppedAt: params.setStoppedAt,
    getLastHeartbeatAt: params.getLastHeartbeatAt,
    setLastHeartbeatAt: params.setLastHeartbeatAt,
    getHeartbeatInterval: params.getHeartbeatInterval,
    setHeartbeatInterval: params.setHeartbeatInterval,
    getSupervisionInterval: params.getSupervisionInterval,
    setSupervisionInterval: params.setSupervisionInterval,
    createAdapter: params.createAdapter,
    ensureRestartState: params.ensureRestartState,
    syncPlatformStateFromHealth: params.syncPlatformStateFromHealth,
    pushTrace: params.pushTrace,
    observeAdapter: params.observeAdapter,
    writeRuntimeStatus: params.writeRuntimeStatus,
    snapshotState: params.snapshotState,
    runHeartbeat: params.runHeartbeat,
    runWatchdog: params.runWatchdog,
  });
  return host;
}

export function buildGatewayRunnerSupervisionDeps(
  params: GatewayRunnerSupervisionHostInputs,
): GatewaySupervisionDependencies {
  return createGatewayRunnerSupervisionDeps({
    adapters: params.adapters,
    daemonState: params.daemonState,
    stateBookkeeping: params.stateBookkeeping,
    recording: params.recording,
    setLastSupervisionAt: params.setLastSupervisionAt,
    observeAdapter: params.observeAdapter,
    writeRuntimeStatus: params.writeRuntimeStatus,
    snapshotState: params.snapshotState,
  });
}

export type { GatewayRunnerLifecycleHost } from "@/gateway/runner/lifecycle/types";
