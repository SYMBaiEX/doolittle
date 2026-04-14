import type { PlatformName } from "@/types/gateway";
import type { GatewayDaemonState, GatewayRestartState } from "../daemon-state";
import type { PlatformAdapter, PlatformHealth } from "../platforms/base";
import type { GatewayTraceRecord } from "../read/history-view";

export type GatewayTransportState =
  | "inactive"
  | "booting"
  | "live"
  | "degraded"
  | "paused";

export type GatewaySupervisionAction =
  | "health"
  | "restart"
  | "recover"
  | "watch"
  | "skip"
  | "backoff";

export interface GatewaySupervisionRecord {
  at: string;
  platform: PlatformName | "gateway";
  action: GatewaySupervisionAction;
  detail: string;
  delayMs?: number;
  attempt?: number;
}

export interface GatewaySupervisionPlatformState {
  ready: boolean;
  status: PlatformHealth["status"];
  transportState: GatewayTransportState;
  restartCount: number;
  restartFailureCount: number;
  lastRestartAt?: string;
  nextRestartAt?: string;
  lastWatchdogAt?: string;
  lastWatchdogReason?: string;
  lastWatchdogAction?: "healthy" | "restart" | "recover" | "backoff" | "skip";
}

export interface GatewaySupervisionDependencies {
  adapters: Map<PlatformName, PlatformAdapter>;
  daemonState: GatewayDaemonState;
  ensureRestartState(platform: PlatformName): GatewayRestartState;
  getPlatformState(platform: PlatformName): GatewaySupervisionPlatformState;
  setLastSupervisionAt(at: string): void;
  recordSupervision(
    platform: PlatformName | "gateway",
    action: GatewaySupervisionAction,
    detail: string,
    delayMs?: number,
    attempt?: number,
  ): GatewaySupervisionRecord;
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
  pushTrace?(entry: GatewayTraceRecord): void;
  writeRuntimeStatus(): void;
  snapshotState(reason: string, limit?: number): Promise<unknown>;
  nowIso(): string;
}
