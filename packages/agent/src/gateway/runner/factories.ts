import type {
  GatewayDaemonState,
  GatewayRestartState,
} from "@/gateway/daemon-state";
import type { GatewayTraceRecord } from "@/gateway/read/history-view";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type { GatewayRunnerLifecycleHost } from "@/gateway/runner/lifecycle/types";
import type {
  GatewayHistorySnapshot,
  GatewayPlatformStateView,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type {
  GatewaySupervisionDependencies,
  GatewaySupervisionRecord,
} from "@/gateway/supervision/index";
import type { PlatformName } from "@/types/gateway";
import {
  nowIso,
  type PlatformAdapter,
  type PlatformHealth,
  type PlatformLifecycleEvent,
} from "../platforms/base";

export interface GatewayRunnerLifecycleAccessors {
  getRunning(): boolean;
  setRunning(value: boolean): void;
  getStartedAt(): string | undefined;
  setStartedAt(value: string | undefined): void;
  getStoppedAt(): string | undefined;
  setStoppedAt(value: string | undefined): void;
  getLastHeartbeatAt(): string | undefined;
  setLastHeartbeatAt(value: string | undefined): void;
  getHeartbeatInterval(): ReturnType<typeof setInterval> | null;
  setHeartbeatInterval(value: ReturnType<typeof setInterval> | null): void;
  getSupervisionInterval(): ReturnType<typeof setInterval> | null;
  setSupervisionInterval(value: ReturnType<typeof setInterval> | null): void;
}

export interface GatewayRunnerLifecycleHostParams
  extends GatewayRunnerLifecycleAccessors {
  context: GatewayRunnerContext;
  adapters: Map<PlatformName, PlatformAdapter>;
  daemonState: GatewayDaemonState;
  createAdapter(platform: PlatformName): PlatformAdapter;
  ensureRestartState(platform: PlatformName): void;
  syncPlatformStateFromHealth(health: PlatformHealth): void;
  pushTrace(entry: GatewayTraceRecord): void;
  observeAdapter(
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ): Promise<void>;
  writeRuntimeStatus(): void;
  snapshotState(reason: string, limit: number): Promise<GatewayHistorySnapshot>;
  runHeartbeat(reason: string): Promise<GatewayStateSnapshot>;
  runWatchdog(reason: string): Promise<GatewaySupervisionRecord[]>;
}

export function createGatewayRunnerLifecycleHost(
  params: GatewayRunnerLifecycleHostParams,
): GatewayRunnerLifecycleHost {
  const {
    context,
    adapters,
    daemonState,
    createAdapter,
    ensureRestartState,
    syncPlatformStateFromHealth,
    pushTrace,
    observeAdapter,
    writeRuntimeStatus,
    snapshotState,
    runHeartbeat,
    runWatchdog,
  } = params;
  const thisRef = params;

  return {
    context,
    adapters,
    daemonState,
    get running() {
      return thisRef.getRunning();
    },
    set running(value: boolean) {
      thisRef.setRunning(value);
    },
    get startedAt() {
      return thisRef.getStartedAt();
    },
    set startedAt(value: string | undefined) {
      thisRef.setStartedAt(value);
    },
    get stoppedAt() {
      return thisRef.getStoppedAt();
    },
    set stoppedAt(value: string | undefined) {
      thisRef.setStoppedAt(value);
    },
    get lastHeartbeatAt() {
      return thisRef.getLastHeartbeatAt();
    },
    set lastHeartbeatAt(value: string | undefined) {
      thisRef.setLastHeartbeatAt(value);
    },
    get heartbeatInterval() {
      return thisRef.getHeartbeatInterval();
    },
    set heartbeatInterval(value: ReturnType<typeof setInterval> | null) {
      thisRef.setHeartbeatInterval(value);
    },
    get supervisionInterval() {
      return thisRef.getSupervisionInterval();
    },
    set supervisionInterval(value: ReturnType<typeof setInterval> | null) {
      thisRef.setSupervisionInterval(value);
    },
    createAdapter,
    ensureRestartState,
    syncPlatformStateFromHealth,
    pushTrace,
    observeAdapter,
    writeRuntimeStatus,
    snapshotState,
    runHeartbeat,
    runWatchdog,
  };
}

export interface GatewayRunnerSupervisionDepsParams {
  adapters: Map<PlatformName, PlatformAdapter>;
  daemonState: GatewayDaemonState;
  stateBookkeeping: {
    ensureRestartState(platform: PlatformName): GatewayRestartState;
    ensurePlatformState(platform: PlatformName): GatewayPlatformStateView;
  };
  recording: {
    recordSupervision(
      platform: PlatformName | "gateway",
      action: GatewaySupervisionRecord["action"],
      detail: string,
      delayMs?: number,
      attempt?: number,
    ): GatewaySupervisionRecord;
    pushTrace(entry: GatewayTraceRecord): void;
  };
  setLastSupervisionAt(at: string): void;
  observeAdapter(
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
  ): Promise<void>;
  writeRuntimeStatus(): void;
  snapshotState(
    reason: string,
    limit?: number,
  ): Promise<GatewayHistorySnapshot>;
}

export function createGatewayRunnerSupervisionDeps(
  params: GatewayRunnerSupervisionDepsParams,
): GatewaySupervisionDependencies {
  const {
    adapters,
    daemonState,
    stateBookkeeping,
    recording,
    setLastSupervisionAt,
    observeAdapter,
    writeRuntimeStatus,
    snapshotState,
  } = params;

  return {
    adapters,
    daemonState,
    ensureRestartState:
      stateBookkeeping.ensureRestartState.bind(stateBookkeeping),
    getPlatformState:
      stateBookkeeping.ensurePlatformState.bind(stateBookkeeping),
    setLastSupervisionAt,
    recordSupervision: recording.recordSupervision.bind(recording),
    observeAdapter,
    pushTrace: recording.pushTrace.bind(recording),
    writeRuntimeStatus,
    snapshotState,
    nowIso,
  };
}
