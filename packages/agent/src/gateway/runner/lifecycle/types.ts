import type { GatewayDaemonState } from "@/gateway/daemon-state";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { PlatformName } from "@/types/gateway";

import type {
  PlatformAdapter,
  PlatformHealth,
  PlatformLifecycleEvent,
} from "../../platforms/base";

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
