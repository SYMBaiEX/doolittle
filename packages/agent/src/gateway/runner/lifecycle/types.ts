import type { PlatformName } from "../../../types/gateway";
import type { GatewayDaemonState } from "../../daemon-state";
import type {
  PlatformAdapter,
  PlatformHealth,
  PlatformLifecycleEvent,
} from "../../platforms/base";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
} from "../../state/state-snapshot/index";
import type { GatewaySupervisionRecord } from "../../supervision/index";
import type { GatewayRunnerContext } from "../context";

export interface GatewayRunnerLifecycleTraceEntry {
  traceId: string;
  at: string;
  kind: "lifecycle" | "heartbeat";
  platform: PlatformName | "gateway";
  detail: string;
}

export interface GatewayRunnerLifecycleHost {
  context: GatewayRunnerContext;
  adapters: Map<PlatformName, PlatformAdapter>;
  daemonState: GatewayDaemonState;
  running: boolean;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  supervisionInterval: ReturnType<typeof setInterval> | null;
  createAdapter(platform: PlatformName): PlatformAdapter;
  ensureRestartState(platform: PlatformName): void;
  syncPlatformStateFromHealth(health: PlatformHealth): void;
  pushTrace(entry: GatewayRunnerLifecycleTraceEntry): void;
  observeAdapter(
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ): Promise<void>;
  writeRuntimeStatus(): void;
  snapshotState(reason: string, limit: number): Promise<GatewayHistorySnapshot>;
  runHeartbeat(reason: string): Promise<GatewayStateSnapshot>;
  runWatchdog(reason: string): Promise<GatewaySupervisionRecord[]>;
}
